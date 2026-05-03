import "./style.css";

type Fruit = {
	id: number;
	level: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
	radius: number;
	bornAt: number;
};

type FruitStyle = {
	name: string;
	fill: string;
	stroke: string;
};

type HighScore = {
	score: number;
	date: string;
};

type MergeEffect = {
	id: number;
	x: number;
	y: number;
	radius: number;
	style: FruitStyle;
	startedAt: number;
	duration: number;
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
	fruitDrag: 0.01,
	maxFruitMass: 42,
	verticalDamping: 0.996,
	sleepSpeed: 2.5,
	settleNudge: 0.006,
	mergePopDuration: 260,
	mergeBurstDuration: 360,
	solverPasses: 5,
};

const highScoreStorageKey = "fruition.highScores.v1";

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
        <div class="hud-stats">
          <span id="fruit-count">0 fruits</span>
          <span id="score">0 pts</span>
        </div>
        <div class="hud-actions">
          <button id="firehose" type="button" aria-pressed="false">Firehose</button>
          <button id="reset" type="button">Reset</button>
        </div>
      </div>
      <div class="scoreboard" aria-label="top scores">
        <span>top</span>
        <ol id="high-scores"></ol>
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
          <span id="game-over-note">Reset to try again</span>
        </div>
      </div>
    </section>
  </main>
`;

const canvas = requiredElement<HTMLCanvasElement>("#playfield");
const resetButton = requiredElement<HTMLButtonElement>("#reset");
const firehoseButton = requiredElement<HTMLButtonElement>("#firehose");
const countLabel = requiredElement<HTMLSpanElement>("#fruit-count");
const scoreLabel = requiredElement<HTMLSpanElement>("#score");
const highScoresList = requiredElement<HTMLOListElement>("#high-scores");
const currentPreview = requiredElement<HTMLDivElement>("#current-preview");
const nextPreview = requiredElement<HTMLDivElement>("#next-preview");
const gameOverOverlay = requiredElement<HTMLDivElement>("#game-over");
const gameOverNote = requiredElement<HTMLSpanElement>("#game-over-note");
const context = requiredCanvasContext(canvas);

const fruits: Fruit[] = [];
const mergeEffects: MergeEffect[] = [];
let nextFruitId = 1;
let nextEffectId = 1;
let previousTime = performance.now();
let lastDropTime = -config.dropCooldownMs;
let currentDropLevel = randomDropLevel();
let nextDropLevel = randomDropLevel();
let isGameOver = false;
let isOverhangWarningActive = false;
let score = 0;
let highScores = loadHighScores();
let isFirehoseActive = false;
let lastFirehoseDropTime = 0;

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
	dropFruitAt(clientX);
}

function dropFruitAt(clientX: number) {
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

	const fruit = {
		id: nextFruitId++,
		level,
		x,
		y: bounds.top + radius + 8,
		vx: 0,
		vy: 0,
		radius,
		bornAt: performance.now(),
	};

	fruits.push(fruit);
	addScoreForFruit(fruit);

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

function updateScore() {
	scoreLabel.textContent = `${formatScore(score)} pts`;
}

function updateHighScores() {
	highScoresList.innerHTML = highScores
		.map((entry) => `<li>${formatScore(entry.score)}</li>`)
		.join("");
}

function step(deltaSeconds: number) {
	maybeRunFirehose();

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
		fruit.vx *= dragForFruit(fruit);
		fruit.vy *= config.verticalDamping;
		if (Math.abs(fruit.vx) < 0.02) {
			fruit.vx = 0;
		}
		if (Math.abs(fruit.vy) < config.sleepSpeed && isFruitSupported(fruit)) {
			fruit.vy = 0;
		}
	}

	applySettlingPressure();
	pruneMergeEffects();
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
	const inverseMassA = inverseMassForFruit(a);
	const inverseMassB = inverseMassForFruit(b);
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
		(-(1 + config.collisionDamping) * separatingVelocity) / inverseMassTotal;
	const impulseX = impulse * normalX;
	const impulseY = impulse * normalY;

	a.vx -= impulseX * inverseMassA;
	a.vy -= impulseY * inverseMassA;
	b.vx += impulseX * inverseMassB;
	b.vy += impulseY * inverseMassB;

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
	const topResponse = inverseMassForFruit(topFruit);
	const bottomResponse = inverseMassForFruit(bottomFruit);

	topFruit.vx += direction * config.contactSideImpulse * strength * topResponse;
	bottomFruit.vx -=
		direction * config.contactSideImpulse * strength * 0.35 * bottomResponse;
	topFruit.vy -= config.contactLiftImpulse * strength * topResponse;
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
				const mergedFruit = createMergedFruit(a, b);
				mergedFruits.push(mergedFruit);
				addScoreForFruit(mergedFruit);
				addMergeEffect(mergedFruit);
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
	const highScoreRank = admitHighScore(score);

	isGameOver = true;
	gameOverOverlay.hidden = false;
	canvas.classList.add("is-game-over");
	setFirehose(false);
	gameOverNote.textContent = highScoreRank
		? `New top ${highScoreRank}! ${formatScore(score)} pts`
		: `Final score: ${formatScore(score)}`;
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

function applySettlingPressure() {
	for (const fruit of fruits) {
		if (!isFruitSupported(fruit)) {
			continue;
		}

		const direction = stableDirection(fruit.id, Math.round(fruit.x + fruit.y));
		fruit.vx += direction * config.settleNudge * inverseMassForFruit(fruit);
		fruit.vy += config.settleNudge * 0.5;
	}
}

function isFruitSupported(fruit: Fruit) {
	const bounds = playBounds();

	if (fruit.y + fruit.radius >= bounds.bottom - 0.8) {
		return true;
	}

	return fruits.some((other) => {
		if (other.id === fruit.id || other.y <= fruit.y) {
			return false;
		}

		const distance = Math.hypot(other.x - fruit.x, other.y - fruit.y);
		return distance <= fruit.radius + other.radius + 0.8;
	});
}

function addScoreForFruit(fruit: Fruit) {
	score += scoreForRadius(fruit.radius);
	updateScore();
}

function addMergeEffect(fruit: Fruit) {
	mergeEffects.push({
		id: nextEffectId++,
		x: fruit.x,
		y: fruit.y,
		radius: fruit.radius,
		style: styleForFruitLevel(fruit.level),
		startedAt: performance.now(),
		duration: config.mergeBurstDuration,
	});
}

function pruneMergeEffects() {
	const now = performance.now();

	for (let i = mergeEffects.length - 1; i >= 0; i -= 1) {
		if (now - mergeEffects[i].startedAt >= mergeEffects[i].duration) {
			mergeEffects.splice(i, 1);
		}
	}
}

function scoreForRadius(radius: number) {
	return Math.round(Math.PI * radius ** 2);
}

function admitHighScore(finalScore: number) {
	if (finalScore <= 0) {
		return null;
	}

	const qualifies =
		highScores.length < 3 || finalScore > highScores[highScores.length - 1].score;

	if (!qualifies) {
		return null;
	}

	const entry = {
		score: finalScore,
		date: new Date().toISOString(),
	};

	highScores = [...highScores, entry]
		.sort((a, b) => b.score - a.score)
		.slice(0, 3);

	saveHighScores(highScores);
	updateHighScores();

	return highScores.indexOf(entry) + 1;
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
	const massA = massForFruit(a);
	const massB = massForFruit(b);
	const totalMass = massA + massB;

	return {
		id: nextFruitId++,
		level: nextLevel,
		x,
		y,
		vx: ((a.vx * massA + b.vx * massB) / totalMass) * 0.42,
		vy: ((a.vy * massA + b.vy * massB) / totalMass) * 0.42,
		radius,
		bornAt: performance.now(),
	};
}

function render() {
	context.clearRect(0, 0, canvas.width, canvas.height);
	drawPlayfieldBackground();

	for (const fruit of fruits) {
		drawFruit(fruit);
	}

	for (const effect of mergeEffects) {
		drawMergeEffect(effect);
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
	const age = performance.now() - fruit.bornAt;
	const popProgress = clamp(age / config.mergePopDuration, 0, 1);
	const popScale = 1 + Math.sin(popProgress * Math.PI) * 0.16;
	const radius = fruit.radius * popScale;

	context.beginPath();
	context.arc(fruit.x, fruit.y, radius, 0, Math.PI * 2);
	context.fillStyle = style.fill;
	context.fill();
	context.lineWidth = 3;
	context.strokeStyle = style.stroke;
	context.stroke();

	context.beginPath();
	context.arc(
		fruit.x - radius * 0.28,
		fruit.y - radius * 0.32,
		radius * 0.18,
		0,
		Math.PI * 2,
	);
	context.fillStyle = "rgba(255, 255, 255, 0.86)";
	context.fill();
}

function drawMergeEffect(effect: MergeEffect) {
	const progress = clamp(
		(performance.now() - effect.startedAt) / effect.duration,
		0,
		1,
	);
	const alpha = 1 - progress;
	const burstRadius = effect.radius * (0.72 + progress * 0.72);

	context.save();
	context.globalAlpha = alpha * 0.72;
	context.strokeStyle = effect.style.fill;
	context.lineWidth = 5 * (1 - progress) + 1;
	context.beginPath();
	context.arc(effect.x, effect.y, burstRadius, 0, Math.PI * 2);
	context.stroke();

	context.globalAlpha = alpha * 0.42;
	context.fillStyle = effect.style.fill;
	for (let i = 0; i < 6; i += 1) {
		const angle = (Math.PI * 2 * i) / 6 + progress * 0.8;
		const distance = effect.radius * (0.45 + progress * 0.85);
		context.beginPath();
		context.arc(
			effect.x + Math.cos(angle) * distance,
			effect.y + Math.sin(angle) * distance,
			Math.max(2, effect.radius * 0.08 * (1 - progress)),
			0,
			Math.PI * 2,
		);
		context.fill();
	}
	context.restore();
}

function maybeRunFirehose() {
	if (!isFirehoseActive || isGameOver) {
		return;
	}

	const now = performance.now();

	if (now - lastFirehoseDropTime < config.dropCooldownMs) {
		return;
	}

	if (outOfBoundsOverhang() >= config.gameOverOverhangLimit) {
		endGame();
		return;
	}

	lastFirehoseDropTime = now;
	lastDropTime = now;
	const rect = canvas.getBoundingClientRect();
	dropFruitAt(rect.left + rect.width / 2);
}

function setFirehose(isActive: boolean) {
	isFirehoseActive = isActive;
	lastFirehoseDropTime = 0;
	firehoseButton.setAttribute("aria-pressed", String(isFirehoseActive));
	firehoseButton.classList.toggle("is-active", isFirehoseActive);
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

function massForFruit(fruit: Fruit) {
	return massForRadius(fruit.radius);
}

function massForRadius(radius: number) {
	return clamp((radius / config.baseFruitRadius) ** 2, 1, config.maxFruitMass);
}

function inverseMassForFruit(fruit: Fruit) {
	return 1 / massForFruit(fruit);
}

function dragForFruit(fruit: Fruit) {
	return 1 - config.fruitDrag / massForFruit(fruit) ** 0.35;
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

function formatScore(value: number) {
	return value.toLocaleString("en-US");
}

function loadHighScores() {
	try {
		const storedScores = localStorage.getItem(highScoreStorageKey);

		if (!storedScores) {
			return [];
		}

		const parsedScores = JSON.parse(storedScores);

		if (!Array.isArray(parsedScores)) {
			return [];
		}

		return parsedScores
			.filter(isHighScore)
			.sort((a, b) => b.score - a.score)
			.slice(0, 3);
	} catch {
		return [];
	}
}

function saveHighScores(scores: HighScore[]) {
	try {
		localStorage.setItem(highScoreStorageKey, JSON.stringify(scores));
	} catch {
		// Scoring still works when storage is unavailable.
	}
}

function isHighScore(value: unknown): value is HighScore {
	return (
		typeof value === "object" &&
		value !== null &&
		"score" in value &&
		"date" in value &&
		typeof value.score === "number" &&
		Number.isFinite(value.score) &&
		typeof value.date === "string"
	);
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

firehoseButton.addEventListener("click", () => {
	setFirehose(!isFirehoseActive);
});

resetButton.addEventListener("click", () => {
	fruits.length = 0;
	mergeEffects.length = 0;
	nextFruitId = 1;
	nextEffectId = 1;
	score = 0;
	lastDropTime = -config.dropCooldownMs;
	currentDropLevel = randomDropLevel();
	nextDropLevel = randomDropLevel();
	isGameOver = false;
	isOverhangWarningActive = false;
	setFirehose(false);
	gameOverOverlay.hidden = true;
	canvas.classList.remove("is-game-over");
	canvas.classList.remove("has-overhang-warning");
	updateCount();
	updateScore();
	updatePreviews();
});

window.addEventListener("resize", updatePreviews);

updateCount();
updateScore();
updateHighScores();
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
