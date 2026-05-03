export type Fruit = {
	id: number;
	level: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	radius: number;
	bornAt: number;
};

export type MergeEffect = {
	id: number;
	x: number;
	y: number;
	radius: number;
	level: number;
	startedAt: number;
	duration: number;
};

export type SimulationConfig = typeof defaultSimulationConfig;

export const defaultSimulationConfig = {
	playWidth: 420,
	playHeight: 620,
	playBorderWidth: 4,
	fruitLevels: 11,
	generatedFruitLevels: 4,
	baseFruitRadius: 14,
	fruitRadiusScale: 1.3,
	gravitySpeed: 980,
	dropCooldownMs: 350,
	gameOverOverhangLimit: 50,
	warningOverhang: 0,
	mergeContactSlop: 1,
	maxCascadeMerges: 24,
	wallBounce: 0.08,
	floorBounce: 0.18,
	floorBounceMinSpeed: 90,
	floorSettleSpeed: 28,
	collisionDamping: 0.4,
	fallingImpactMinSpeed: 72,
	verticalContactThreshold: 0.16,
	contactSideImpulse: 44,
	contactLiftImpulse: 14,
	fruitDrag: 0.01,
	maxFruitMass: 42,
	verticalDamping: 0.996,
	sleepSpeed: 2.5,
	settleNudge: 0.006,
	mergePopDuration: 260,
	mergeBurstDuration: 360,
	solverPasses: 5,
};

type Bounds = {
	left: number;
	right: number;
	top: number;
	bottom: number;
};

export class GameSimulation {
	readonly config: SimulationConfig;
	readonly fruits: Fruit[] = [];
	readonly mergeEffects: MergeEffect[] = [];
	currentDropLevel: number;
	nextDropLevel: number;
	isGameOver = false;
	score = 0;
	drops = 0;
	private nextFruitId = 1;
	private nextEffectId = 1;
	private lastDropTime: number;
	private readonly random: () => number;

	constructor(options: {
		config?: Partial<SimulationConfig>;
		random?: () => number;
		now?: number;
	} = {}) {
		this.config = { ...defaultSimulationConfig, ...options.config };
		this.random = options.random ?? Math.random;
		this.lastDropTime = (options.now ?? 0) - this.config.dropCooldownMs;
		this.currentDropLevel = this.randomDropLevel();
		this.nextDropLevel = this.randomDropLevel();
	}

	reset(now = 0) {
		this.fruits.length = 0;
		this.mergeEffects.length = 0;
		this.nextFruitId = 1;
		this.nextEffectId = 1;
		this.score = 0;
		this.drops = 0;
		this.lastDropTime = now - this.config.dropCooldownMs;
		this.currentDropLevel = this.randomDropLevel();
		this.nextDropLevel = this.randomDropLevel();
		this.isGameOver = false;
	}

	dropAt(x: number, now: number, options: { enforceCooldown?: boolean } = {}) {
		if (this.isGameOver) {
			return false;
		}

		if (
			options.enforceCooldown !== false &&
			now - this.lastDropTime < this.config.dropCooldownMs
		) {
			return false;
		}

		if (this.outOfBoundsOverhang() >= this.config.gameOverOverhangLimit) {
			this.isGameOver = true;
			return false;
		}

		this.lastDropTime = now;
		this.spawnFruitAt(x, now);
		return true;
	}

	step(deltaSeconds: number, now: number) {
		const dt = Math.min(deltaSeconds, 1 / 30);

		for (const fruit of this.fruits) {
			fruit.vy += this.config.gravitySpeed * dt;
			fruit.y += fruit.vy * dt;
			fruit.x += fruit.vx * dt;
			this.resolveWalls(fruit);
		}

		for (let pass = 0; pass < this.config.solverPasses; pass += 1) {
			for (let i = 0; i < this.fruits.length; i += 1) {
				for (let j = i + 1; j < this.fruits.length; j += 1) {
					this.resolveFruitPair(this.fruits[i], this.fruits[j]);
				}
			}

			for (const fruit of this.fruits) {
				this.resolveWalls(fruit);
			}
		}

		for (const fruit of this.fruits) {
			fruit.vx *= this.dragForFruit(fruit);
			fruit.vy *= this.config.verticalDamping;
			if (Math.abs(fruit.vx) < 0.02) {
				fruit.vx = 0;
			}
			if (Math.abs(fruit.vy) < this.config.sleepSpeed && this.isFruitSupported(fruit)) {
				fruit.vy = 0;
			}
		}

		this.applySettlingPressure();
		this.pruneMergeEffects(now);
		this.resolveMerges(now);
	}

	radiusForFruitLevel(level: number) {
		const clampedLevel = clamp(Math.round(level), 1, this.config.fruitLevels);
		return Math.round(
			this.config.baseFruitRadius *
				this.config.fruitRadiusScale ** (clampedLevel - 1),
		);
	}

	outOfBoundsOverhang() {
		const bounds = this.playBounds();

		return this.fruits.reduce((total, fruit) => {
			const fruitTop = fruit.y - fruit.radius;
			return total + Math.max(0, bounds.top - fruitTop);
		}, 0);
	}

	private spawnFruitAt(x: number, now: number) {
		const level = this.currentDropLevel;
		const radius = this.radiusForFruitLevel(level);
		const bounds = this.playBounds();
		const fruit = {
			id: this.nextFruitId++,
			level,
			x: clamp(x, bounds.left + radius, bounds.right - radius),
			y: bounds.top + radius + 8,
			vx: 0,
			vy: 0,
			radius,
			bornAt: now,
		};

		this.fruits.push(fruit);
		this.score += scoreForRadius(fruit.radius);
		this.drops += 1;
		this.currentDropLevel = this.nextDropLevel;
		this.nextDropLevel = this.randomDropLevel();
	}

	private resolveWalls(fruit: Fruit) {
		const bounds = this.playBounds();

		if (fruit.x - fruit.radius < bounds.left) {
			fruit.x = bounds.left + fruit.radius;
			fruit.vx = Math.abs(fruit.vx) * this.config.wallBounce;
		}

		if (fruit.x + fruit.radius > bounds.right) {
			fruit.x = bounds.right - fruit.radius;
			fruit.vx = -Math.abs(fruit.vx) * this.config.wallBounce;
		}

		if (fruit.y + fruit.radius > bounds.bottom) {
			const impactSpeed = fruit.vy;
			fruit.y = bounds.bottom - fruit.radius;
			fruit.vy =
				impactSpeed > this.config.floorBounceMinSpeed
					? -impactSpeed * this.config.floorBounce
					: 0;

			if (Math.abs(fruit.vy) < this.config.floorSettleSpeed) {
				fruit.vy = 0;
			}
		}
	}

	private resolveFruitPair(a: Fruit, b: Fruit) {
		const dx = b.x - a.x;
		const dy = b.y - a.y;
		const minDistance = a.radius + b.radius;
		const distance = Math.hypot(dx, dy);

		if (distance >= minDistance) {
			return;
		}

		const normalX = distance === 0 ? 1 : dx / distance;
		const normalY = distance === 0 ? 0 : dy / distance;
		const overlap = minDistance - distance;
		const inverseMassA = this.inverseMassForFruit(a);
		const inverseMassB = this.inverseMassForFruit(b);
		const inverseMassTotal = inverseMassA + inverseMassB;

		a.x -= normalX * overlap * (inverseMassA / inverseMassTotal);
		a.y -= normalY * overlap * (inverseMassA / inverseMassTotal);
		b.x += normalX * overlap * (inverseMassB / inverseMassTotal);
		b.y += normalY * overlap * (inverseMassB / inverseMassTotal);

		const relativeVelocityX = b.vx - a.vx;
		const relativeVelocityY = b.vy - a.vy;
		const separatingVelocity =
			relativeVelocityX * normalX + relativeVelocityY * normalY;

		if (separatingVelocity > 0) {
			return;
		}

		const impactSpeed = -separatingVelocity;
		const impulse =
			(-(1 + this.config.collisionDamping) * separatingVelocity) /
			inverseMassTotal;
		const impulseX = impulse * normalX;
		const impulseY = impulse * normalY;

		a.vx -= impulseX * inverseMassA;
		a.vy -= impulseY * inverseMassA;
		b.vx += impulseX * inverseMassB;
		b.vy += impulseY * inverseMassB;

		this.applyLandingBounce(a, b, normalX, normalY, impactSpeed);
	}

	private applyLandingBounce(
		a: Fruit,
		b: Fruit,
		normalX: number,
		normalY: number,
		impactSpeed: number,
	) {
		const isNearlyVerticalContact =
			Math.abs(normalX) < this.config.verticalContactThreshold &&
			Math.abs(normalY) > 0.86;

		if (!isNearlyVerticalContact || impactSpeed < this.config.fallingImpactMinSpeed) {
			return;
		}

		const topFruit = a.y < b.y ? a : b;
		const bottomFruit = topFruit === a ? b : a;
		const direction = stableDirection(topFruit.id, bottomFruit.id);
		const strength = clamp(impactSpeed / 420, 0, 1);
		const topResponse = this.inverseMassForFruit(topFruit);
		const bottomResponse = this.inverseMassForFruit(bottomFruit);

		topFruit.vx += direction * this.config.contactSideImpulse * strength * topResponse;
		bottomFruit.vx -=
			direction *
			this.config.contactSideImpulse *
			strength *
			0.35 *
			bottomResponse;
		topFruit.vy -= this.config.contactLiftImpulse * strength * topResponse;
	}

	private resolveMerges(now: number) {
		let cascadeCount = 0;
		let mergePairs = this.findMergePairs();

		while (mergePairs.length > 0 && cascadeCount < this.config.maxCascadeMerges) {
			const mergedFruits: Fruit[] = [];
			const removedFruitIds = new Set<number>();

			for (const [a, b] of mergePairs) {
				removedFruitIds.add(a.id);
				removedFruitIds.add(b.id);

				if (a.level < this.config.fruitLevels) {
					const mergedFruit = this.createMergedFruit(a, b, now);
					mergedFruits.push(mergedFruit);
					this.score += scoreForRadius(mergedFruit.radius);
					this.addMergeEffect(mergedFruit, now);
				}
			}

			const remainingFruits = this.fruits.filter(
				(fruit) => !removedFruitIds.has(fruit.id),
			);
			this.fruits.length = 0;
			this.fruits.push(...remainingFruits, ...mergedFruits);

			cascadeCount += 1;
			mergePairs = this.findMergePairs();
		}
	}

	private findMergePairs(): Array<[Fruit, Fruit]> {
		const pairs: Array<[Fruit, Fruit]> = [];
		const usedFruitIds = new Set<number>();

		for (let i = 0; i < this.fruits.length; i += 1) {
			const a = this.fruits[i];

			if (usedFruitIds.has(a.id)) {
				continue;
			}

			for (let j = i + 1; j < this.fruits.length; j += 1) {
				const b = this.fruits[j];

				if (usedFruitIds.has(b.id) || a.level !== b.level) {
					continue;
				}

				const dx = b.x - a.x;
				const dy = b.y - a.y;
				const contactDistance =
					a.radius + b.radius + this.config.mergeContactSlop;

				if (Math.hypot(dx, dy) <= contactDistance) {
					pairs.push([a, b]);
					usedFruitIds.add(a.id);
					usedFruitIds.add(b.id);
					break;
				}
			}
		}

		return pairs;
	}

	private createMergedFruit(a: Fruit, b: Fruit, now: number): Fruit {
		const nextLevel = a.level + 1;
		const radius = this.radiusForFruitLevel(nextLevel);
		const bounds = this.playBounds();
		const x = clamp((a.x + b.x) / 2, bounds.left + radius, bounds.right - radius);
		const y = clamp((a.y + b.y) / 2, bounds.top + radius, bounds.bottom - radius);
		const massA = this.massForFruit(a);
		const massB = this.massForFruit(b);
		const totalMass = massA + massB;

		return {
			id: this.nextFruitId++,
			level: nextLevel,
			x,
			y,
			vx: ((a.vx * massA + b.vx * massB) / totalMass) * 0.42,
			vy: ((a.vy * massA + b.vy * massB) / totalMass) * 0.42,
			radius,
			bornAt: now,
		};
	}

	private addMergeEffect(fruit: Fruit, now: number) {
		this.mergeEffects.push({
			id: this.nextEffectId++,
			x: fruit.x,
			y: fruit.y,
			radius: fruit.radius,
			level: fruit.level,
			startedAt: now,
			duration: this.config.mergeBurstDuration,
		});
	}

	private pruneMergeEffects(now: number) {
		for (let i = this.mergeEffects.length - 1; i >= 0; i -= 1) {
			if (now - this.mergeEffects[i].startedAt >= this.mergeEffects[i].duration) {
				this.mergeEffects.splice(i, 1);
			}
		}
	}

	private applySettlingPressure() {
		for (const fruit of this.fruits) {
			if (!this.isFruitSupported(fruit)) {
				continue;
			}

			const direction = stableDirection(fruit.id, Math.round(fruit.x + fruit.y));
			fruit.vx += direction * this.config.settleNudge * this.inverseMassForFruit(fruit);
			fruit.vy += this.config.settleNudge * 0.5;
		}
	}

	private isFruitSupported(fruit: Fruit) {
		const bounds = this.playBounds();

		if (fruit.y + fruit.radius >= bounds.bottom - 0.8) {
			return true;
		}

		return this.fruits.some((other) => {
			if (other.id === fruit.id || other.y <= fruit.y) {
				return false;
			}

			const distance = Math.hypot(other.x - fruit.x, other.y - fruit.y);
			return distance <= fruit.radius + other.radius + 0.8;
		});
	}

	private playBounds(): Bounds {
		const inset = this.config.playBorderWidth;

		return {
			left: inset,
			right: this.config.playWidth - inset,
			top: inset,
			bottom: this.config.playHeight - inset,
		};
	}

	private massForFruit(fruit: Fruit) {
		return this.massForRadius(fruit.radius);
	}

	private massForRadius(radius: number) {
		return clamp(
			(radius / this.config.baseFruitRadius) ** 2,
			1,
			this.config.maxFruitMass,
		);
	}

	private inverseMassForFruit(fruit: Fruit) {
		return 1 / this.massForFruit(fruit);
	}

	private dragForFruit(fruit: Fruit) {
		return 1 - this.config.fruitDrag / this.massForFruit(fruit) ** 0.35;
	}

	private randomDropLevel() {
		return 1 + Math.floor(this.random() * this.config.generatedFruitLevels);
	}
}

export function scoreForRadius(radius: number) {
	return Math.round(Math.PI * radius ** 2);
}

export function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

export function stableDirection(a: number, b: number) {
	return (a * 31 + b * 17) % 2 === 0 ? 1 : -1;
}

