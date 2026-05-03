import "./style.css";

type Fruit = {
	id: number;
	level: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	radius: number;
};

type FruitStyle = {
	name: string;
	fill: string;
	stroke: string;
};

const config = {
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
	solverPasses: 5,
};

const fruitStyles: FruitStyle[] = [
	{ name: "red", fill: "#ef4444", stroke: "#991b1b" },
	{ name: "blue", fill: "#3b82f6", stroke: "#1d4ed8" },
	{ name: "lime", fill: "#84cc16", stroke: "#3f6212" },
	{ name: "violet", fill: "#8b5cf6", stroke: "#6d28d9" },
	{ name: "amber", fill: "#f59e0b", stroke: "#92400e" },
	{ name: "cyan", fill: "#06b6d4", stroke: "#155e75" },
	{ name: "pink", fill: "#ec4899", stroke: "#9d174d" },
	{ name: "emerald", fill: "#10b981", stroke: "#065f46" },
	{ name: "orange", fill: "#f97316", stroke: "#9a3412" },
	{ name: "sky", fill: "#0ea5e9", stroke: "#0369a1" },
	{ name: "rose", fill: "#f43f5e", stroke: "#9f1239" },
];

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
	throw new Error("Missing #app root");
}

app.innerHTML = `
  <main class="game-shell">
    <section class="game-copy" aria-labelledby="title">
      <p class="eyebrow">first playable prototype</p>
      <h1 id="title">fruition</h1>
      <p class="lede">Click or tap inside the box to drop a randomly sized plain circle. Matching sizes merge upward, while the biggest pair clears space.</p>
    </section>

    <section class="game-stage" aria-label="fruition prototype">
      <div class="hud">
        <span id="fruit-count">0 fruits</span>
        <button id="reset" type="button">Reset</button>
      </div>
      <div class="drop-previews" aria-label="upcoming fruit">
        <div id="current-preview" class="fruit-preview current-preview" aria-label="current fruit"></div>
        <div class="next-preview-box" aria-label="next fruit">
          <span>next</span>
          <div id="next-preview" class="fruit-preview"></div>
        </div>
      </div>
      <div id="playfield-wrap" class="playfield-wrap">
        <canvas id="playfield" width="${config.playWidth}" height="${config.playHeight}" aria-label="clickable play area"></canvas>
        <div id="game-over" class="game-over" hidden>
          <strong>Game over</strong>
          <span>Reset to try again</span>
        </div>
      </div>
    </section>
  </main>
`;

const canvas = requiredElement<HTMLCanvasElement>("#playfield");
const resetButton = requiredElement<HTMLButtonElement>("#reset");
const countLabel = requiredElement<HTMLSpanElement>("#fruit-count");
const currentPreview = requiredElement<HTMLDivElement>("#current-preview");
const nextPreview = requiredElement<HTMLDivElement>("#next-preview");
const gameOverOverlay = requiredElement<HTMLDivElement>("#game-over");
const context = requiredCanvasContext(canvas);

const fruits: Fruit[] = [];
let nextFruitId = 1;
let previousTime = performance.now();
let lastDropTime = -config.dropCooldownMs;
let currentDropLevel = randomDropLevel();
let nextDropLevel = randomDropLevel();
let isGameOver = false;
let isOverhangWarningActive = false;

function addFruit(clientX: number) {
	if (isGameOver) {
		return;
	}

	const now = performance.now();

	if (now - lastDropTime < config.dropCooldownMs) {
		return;
	}

	if (outOfBoundsOverhang() >= config.gameOverOverhangLimit) {
		endGame();
		return;
	}

	lastDropTime = now;

	const rect = canvas.getBoundingClientRect();
	const scaleX = canvas.width / rect.width;
	const level = currentDropLevel;
	const radius = radiusForFruitLevel(level);
	const bounds = playBounds();
	const x = clamp(
		(clientX - rect.left) * scaleX,
		bounds.left + radius,
		bounds.right - radius,
	);

	fruits.push({
		id: nextFruitId++,
		level,
		x,
		y: bounds.top + radius + 8,
		vx: 0,
		vy: 0,
		radius,
	});

	currentDropLevel = nextDropLevel;
	nextDropLevel = randomDropLevel();
	updateCount();
	updatePreviews();
}

function updateCount() {
	const noun = fruits.length === 1 ? "fruit" : "fruits";
	countLabel.textContent = isGameOver
		? "Game over"
		: `${fruits.length} ${noun}`;
}

function step(deltaSeconds: number) {
	const dt = Math.min(deltaSeconds, 1 / 30);

	for (const fruit of fruits) {
		fruit.vy += config.gravitySpeed * dt;
		fruit.y += fruit.vy * dt;
		fruit.x += fruit.vx * dt;

		resolveWalls(fruit);
	}

	for (let pass = 0; pass < config.solverPasses; pass += 1) {
		for (let i = 0; i < fruits.length; i += 1) {
			for (let j = i + 1; j < fruits.length; j += 1) {
				resolveFruitPair(fruits[i], fruits[j]);
			}
		}

		for (const fruit of fruits) {
			resolveWalls(fruit);
		}
	}

	for (const fruit of fruits) {
		fruit.vx *= 0.995;
		if (Math.abs(fruit.vx) < 0.02) {
			fruit.vx = 0;
		}
	}

	resolveMerges();
	updateOverhangWarning();
}

function resolveWalls(fruit: Fruit) {
	const bounds = playBounds();

	if (fruit.x - fruit.radius < bounds.left) {
		fruit.x = bounds.left + fruit.radius;
		fruit.vx = Math.abs(fruit.vx) * config.wallBounce;
	}

	if (fruit.x + fruit.radius > bounds.right) {
		fruit.x = bounds.right - fruit.radius;
		fruit.vx = -Math.abs(fruit.vx) * config.wallBounce;
	}

	if (fruit.y + fruit.radius > bounds.bottom) {
		const impactSpeed = fruit.vy;

		fruit.y = bounds.bottom - fruit.radius;
		fruit.vy =
			impactSpeed > config.floorBounceMinSpeed
				? -impactSpeed * config.floorBounce
				: 0;

		if (Math.abs(fruit.vy) < config.floorSettleSpeed) {
			fruit.vy = 0;
		}
	}
}

function resolveFruitPair(a: Fruit, b: Fruit) {
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
	const correction = overlap / 2;

	a.x -= normalX * correction;
	a.y -= normalY * correction;
	b.x += normalX * correction;
	b.y += normalY * correction;

	const relativeVelocityX = b.vx - a.vx;
	const relativeVelocityY = b.vy - a.vy;
	const separatingVelocity =
		relativeVelocityX * normalX + relativeVelocityY * normalY;

	if (separatingVelocity > 0) {
		return;
	}

	const impactSpeed = -separatingVelocity;
	const impulse = (-(1 + config.collisionDamping) * separatingVelocity) / 2;
	const impulseX = impulse * normalX;
	const impulseY = impulse * normalY;

	a.vx -= impulseX;
	a.vy -= impulseY;
	b.vx += impulseX;
	b.vy += impulseY;

	applyLandingBounce(a, b, normalX, normalY, impactSpeed);
}

function applyLandingBounce(
	a: Fruit,
	b: Fruit,
	normalX: number,
	normalY: number,
	impactSpeed: number,
) {
	const isNearlyVerticalContact =
		Math.abs(normalX) < config.verticalContactThreshold &&
		Math.abs(normalY) > 0.86;

	if (!isNearlyVerticalContact || impactSpeed < config.fallingImpactMinSpeed) {
		return;
	}

	const topFruit = a.y < b.y ? a : b;
	const bottomFruit = topFruit === a ? b : a;
	const direction = stableDirection(topFruit.id, bottomFruit.id);
	const strength = clamp(impactSpeed / 420, 0, 1);

	topFruit.vx += direction * config.contactSideImpulse * strength;
	bottomFruit.vx -= direction * config.contactSideImpulse * strength * 0.35;
	topFruit.vy -= config.contactLiftImpulse * strength;
}

function resolveMerges() {
	let cascadeCount = 0;
	let mergePairs = findMergePairs();

	while (mergePairs.length > 0 && cascadeCount < config.maxCascadeMerges) {
		const mergedFruits: Fruit[] = [];
		const removedFruitIds = new Set<number>();

		for (const [a, b] of mergePairs) {
			removedFruitIds.add(a.id);
			removedFruitIds.add(b.id);

			if (a.level < config.fruitLevels) {
				mergedFruits.push(createMergedFruit(a, b));
			}
		}

		const remainingFruits = fruits.filter(
			(fruit) => !removedFruitIds.has(fruit.id),
		);
		fruits.length = 0;
		fruits.push(...remainingFruits, ...mergedFruits);

		cascadeCount += 1;
		mergePairs = findMergePairs();
	}

	updateCount();
}

function endGame() {
	isGameOver = true;
	gameOverOverlay.hidden = false;
	canvas.classList.add("is-game-over");
	updateOverhangWarning();
	updateCount();
}

function outOfBoundsOverhang() {
	const bounds = playBounds();

	return fruits.reduce((total, fruit) => {
		const fruitTop = fruit.y - fruit.radius;
		return total + Math.max(0, bounds.top - fruitTop);
	}, 0);
}

function findMergePairs(): Array<[Fruit, Fruit]> {
	const pairs: Array<[Fruit, Fruit]> = [];
	const usedFruitIds = new Set<number>();

	for (let i = 0; i < fruits.length; i += 1) {
		const a = fruits[i];

		if (usedFruitIds.has(a.id)) {
			continue;
		}

		for (let j = i + 1; j < fruits.length; j += 1) {
			const b = fruits[j];

			if (usedFruitIds.has(b.id) || a.level !== b.level) {
				continue;
			}

			const dx = b.x - a.x;
			const dy = b.y - a.y;
			const contactDistance = a.radius + b.radius + config.mergeContactSlop;

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

function createMergedFruit(a: Fruit, b: Fruit): Fruit {
	const nextLevel = a.level + 1;
	const radius = radiusForFruitLevel(nextLevel);
	const bounds = playBounds();
	const x = clamp((a.x + b.x) / 2, bounds.left + radius, bounds.right - radius);
	const y = clamp((a.y + b.y) / 2, bounds.top + radius, bounds.bottom - radius);

	return {
		id: nextFruitId++,
		level: nextLevel,
		x,
		y,
		vx: (a.vx + b.vx) * 0.28,
		vy: (a.vy + b.vy) * 0.28,
		radius,
	};
}

function render() {
	context.clearRect(0, 0, canvas.width, canvas.height);
	drawPlayfieldBackground();

	for (const fruit of fruits) {
		drawFruit(fruit);
	}

	drawPlayfieldOverlay();
}

function drawPlayfieldBackground() {
	context.fillStyle = "#f7f2df";
	context.fillRect(0, 0, canvas.width, canvas.height);

	context.fillStyle = "#ded5b1";
	context.fillRect(0, canvas.height - 44, canvas.width, 44);
}

function drawPlayfieldOverlay() {
	context.strokeStyle = "#363127";
	context.lineWidth = 4;

	context.setLineDash([14, 18]);
	context.strokeStyle = "rgba(54, 49, 39, 0.2)";
	context.lineWidth = 3;
	context.beginPath();
	context.moveTo(canvas.width / 2, 22);
	context.lineTo(canvas.width / 2, canvas.height - 24);
	context.stroke();
	context.setLineDash([]);

	context.strokeStyle = isOverhangWarningActive ? "#dc2626" : "#363127";
	context.lineWidth = 4;
	context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
}

function drawFruit(fruit: Fruit) {
	const style = styleForFruitLevel(fruit.level);

	context.beginPath();
	context.arc(fruit.x, fruit.y, fruit.radius, 0, Math.PI * 2);
	context.fillStyle = style.fill;
	context.fill();
	context.lineWidth = 3;
	context.strokeStyle = style.stroke;
	context.stroke();

	context.beginPath();
	context.arc(
		fruit.x - fruit.radius * 0.28,
		fruit.y - fruit.radius * 0.32,
		fruit.radius * 0.18,
		0,
		Math.PI * 2,
	);
	context.fillStyle = "rgba(255, 255, 255, 0.86)";
	context.fill();
}

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

function playBounds() {
	const inset = config.playBorderWidth;

	return {
		left: inset,
		right: canvas.width - inset,
		top: inset,
		bottom: canvas.height - inset,
	};
}

function stableDirection(a: number, b: number) {
	return (a * 31 + b * 17) % 2 === 0 ? 1 : -1;
}

function randomDropLevel() {
	return 1 + Math.floor(Math.random() * config.generatedFruitLevels);
}

function radiusForFruitLevel(level: number) {
	const clampedLevel = clamp(Math.round(level), 1, config.fruitLevels);
	return Math.round(
		config.baseFruitRadius * config.fruitRadiusScale ** (clampedLevel - 1),
	);
}

function styleForFruitLevel(level: number) {
	return fruitStyles[clamp(Math.round(level), 1, config.fruitLevels) - 1];
}

function updatePreviews() {
	updatePreview(currentPreview, currentDropLevel);
	updatePreview(nextPreview, nextDropLevel);
}

function updatePreview(element: HTMLElement, level: number) {
	const style = styleForFruitLevel(level);
	const radius = radiusForFruitLevel(level);
	const canvasScale = canvas.getBoundingClientRect().width / canvas.width;

	element.style.setProperty(
		"--fruit-preview-size",
		`${Math.round(radius * 2 * canvasScale)}px`,
	);
	element.style.setProperty("--fruit-preview-fill", style.fill);
	element.style.setProperty("--fruit-preview-stroke", style.stroke);
	element.setAttribute("aria-label", `${style.name} level ${level} fruit`);
}

function requiredElement<T extends Element>(selector: string): T {
	const element = document.querySelector<T>(selector);

	if (!element) {
		throw new Error(`Missing required element: ${selector}`);
	}

	return element;
}

function requiredCanvasContext(
	target: HTMLCanvasElement,
): CanvasRenderingContext2D {
	const renderingContext = target.getContext("2d");

	if (!renderingContext) {
		throw new Error("Canvas rendering context did not initialize");
	}

	return renderingContext;
}

function gameLoop(now: number) {
	const deltaSeconds = (now - previousTime) / 1000;
	previousTime = now;

	step(deltaSeconds);
	render();
	requestAnimationFrame(gameLoop);
}

canvas.addEventListener("pointerdown", (event) => {
	addFruit(event.clientX);
});

resetButton.addEventListener("click", () => {
	fruits.length = 0;
	nextFruitId = 1;
	lastDropTime = -config.dropCooldownMs;
	currentDropLevel = randomDropLevel();
	nextDropLevel = randomDropLevel();
	isGameOver = false;
	isOverhangWarningActive = false;
	gameOverOverlay.hidden = true;
	canvas.classList.remove("is-game-over");
	canvas.classList.remove("has-overhang-warning");
	updateCount();
	updatePreviews();
});

window.addEventListener("resize", updatePreviews);

updateCount();
updatePreviews();
requestAnimationFrame(gameLoop);

function updateOverhangWarning() {
	const shouldWarn =
		!isGameOver && outOfBoundsOverhang() > config.warningOverhang;

	if (shouldWarn === isOverhangWarningActive) {
		return;
	}

	isOverhangWarningActive = shouldWarn;
	canvas.classList.toggle("has-overhang-warning", shouldWarn);
}
