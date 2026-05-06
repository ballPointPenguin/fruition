import "./style.css";
import {
	GameSimulation,
	type Fruit,
	type MergeEffect,
	defaultSimulationConfig,
} from "./simulation";

type FruitStyle = {
	name: string;
	asset: string;
	fill: string;
	stroke: string;
	artScale: number;
};

type HighScore = {
	score: number;
	date: string;
};

const highScoreStorageKey = "fruition.highScores.v1";

const fruitStyles: FruitStyle[] = [
	{
		name: "blueberry",
		asset: "/blueberry.svg",
		fill: "#5a78b0",
		stroke: "#1c2d54",
		artScale: 2.64,
	},
	{
		name: "cherry",
		asset: "/cherry.svg",
		fill: "#ec4899",
		stroke: "#9d174d",
		artScale: 2.86,
	},
	{
		name: "strawberry",
		asset: "/strawberry.svg",
		fill: "#f97316",
		stroke: "#9a3412",
		artScale: 2.78,
	},
	{
		name: "lime",
		asset: "/lime.svg",
		fill: "#84cc16",
		stroke: "#3f6212",
		artScale: 2.64,
	},
	{
		name: "plum",
		asset: "/plum.svg",
		fill: "#f9a8d4",
		stroke: "#9d174d",
		artScale: 2.64,
	},
	{
		name: "orange",
		asset: "/orange.svg",
		fill: "#f59e0b",
		stroke: "#92400e",
		artScale: 2.64,
	},
	{
		name: "apple",
		asset: "/apple.svg",
		fill: "#ef4444",
		stroke: "#991b1b",
		artScale: 2.64,
	},
	{
		name: "pomegranate",
		asset: "/pomegranate.svg",
		fill: "#ec4899",
		stroke: "#9d174d",
		artScale: 2.74,
	},
	{
		name: "coconut",
		asset: "/coconut.svg",
		fill: "#b45309",
		stroke: "#78350f",
		artScale: 2.64,
	},
	{
		name: "pineapple",
		asset: "/pineapple.svg",
		fill: "#facc15",
		stroke: "#a16207",
		artScale: 2.7,
	},
	{
		name: "watermelon",
		asset: "/watermelon.svg",
		fill: "#22c55e",
		stroke: "#166534",
		artScale: 2.42,
	},
];

const fruitImages = fruitStyles.map((style) => {
	const image = new Image();
	image.src = style.asset;
	return image;
});

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
	throw new Error("Missing #app root");
}

app.innerHTML = `
  <main class="game-shell">
    <section class="game-copy" aria-labelledby="title">
      <p class="eyebrow">first playable prototype</p>
      <h1 id="title">fruition</h1>
      <p class="lede">Click or tap inside the box to drop a randomly sized fruit. Matching fruits merge upward, while the biggest pair clears space.</p>
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
      <div id="playfield-wrap" class="playfield-wrap" style="--playfield-aspect-ratio: ${defaultSimulationConfig.playWidth} / ${defaultSimulationConfig.playHeight}">
        <canvas id="playfield" width="${defaultSimulationConfig.playWidth}" height="${defaultSimulationConfig.playHeight}" aria-label="clickable play area"></canvas>
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
const simulation = new GameSimulation({ now: performance.now() });

let previousTime = performance.now();
let highScores = loadHighScores();
let isFirehoseActive = false;
let lastFirehoseDropTime = 0;
let wasGameOver = false;
let isOverhangWarningActive = false;

function addFruit(clientX: number) {
	if (simulation.isGameOver) {
		return;
	}

	const rect = canvas.getBoundingClientRect();
	const scaleX = canvas.width / rect.width;
	simulation.dropAt((clientX - rect.left) * scaleX, performance.now());
	syncHud();
}

function syncHud() {
	updateCount();
	updateScore();
	updatePreviews();
	updateOverhangWarning();
	syncGameOver();
}

function updateCount() {
	const noun = simulation.fruits.length === 1 ? "fruit" : "fruits";
	countLabel.textContent = simulation.isGameOver
		? "Game over"
		: `${simulation.fruits.length} ${noun}`;
}

function updateScore() {
	scoreLabel.textContent = `${formatScore(simulation.score)} pts`;
}

function updateHighScores() {
	highScoresList.innerHTML = highScores
		.map((entry) => `<li>${formatScore(entry.score)}</li>`)
		.join("");
}

function syncGameOver() {
	if (!simulation.isGameOver || wasGameOver) {
		return;
	}

	wasGameOver = true;
	setFirehose(false);
	const highScoreRank = admitHighScore(simulation.score);
	gameOverOverlay.hidden = false;
	canvas.classList.add("is-game-over");
	gameOverNote.textContent = highScoreRank
		? `New top ${highScoreRank}! ${formatScore(simulation.score)} pts`
		: `Final score: ${formatScore(simulation.score)}`;
	updateCount();
}

function gameLoop(now: number) {
	const deltaSeconds = (now - previousTime) / 1000;
	previousTime = now;

	maybeRunFirehose(now);
	simulation.step(deltaSeconds, now);
	syncHud();
	render(now);
	requestAnimationFrame(gameLoop);
}

function maybeRunFirehose(now: number) {
	if (!isFirehoseActive || simulation.isGameOver) {
		return;
	}

	if (now - lastFirehoseDropTime < simulation.config.dropCooldownMs) {
		return;
	}

	lastFirehoseDropTime = now;
	simulation.dropAt(simulation.config.playWidth / 2, now, {
		enforceCooldown: false,
	});
}

function setFirehose(isActive: boolean) {
	isFirehoseActive = isActive;
	lastFirehoseDropTime = 0;
	firehoseButton.setAttribute("aria-pressed", String(isFirehoseActive));
	firehoseButton.classList.toggle("is-active", isFirehoseActive);
}

function render(now: number) {
	context.clearRect(0, 0, canvas.width, canvas.height);
	drawPlayfieldBackground();

	for (const fruit of simulation.fruits) {
		drawFruit(fruit, now);
	}

	for (const effect of simulation.mergeEffects) {
		drawMergeEffect(effect, now);
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

function drawFruit(fruit: Fruit, now: number) {
	const style = styleForFruitLevel(fruit.level);
	const image = imageForFruitLevel(fruit.level);
	const age = now - fruit.bornAt;
	const popProgress = clamp(age / simulation.config.mergePopDuration, 0, 1);
	const popScale = 1 + Math.sin(popProgress * Math.PI) * 0.16;
	const radius = fruit.radius * popScale;

	if (image.complete && image.naturalWidth > 0) {
		const size = radius * style.artScale;
		context.drawImage(
			image,
			fruit.x - size / 2,
			fruit.y - size / 2,
			size,
			size,
		);
		return;
	}

	drawFallbackFruit(fruit.x, fruit.y, radius, style);
}

function drawMergeEffect(effect: MergeEffect, now: number) {
	const style = styleForFruitLevel(effect.level);
	const progress = clamp((now - effect.startedAt) / effect.duration, 0, 1);
	const alpha = 1 - progress;
	const burstRadius = effect.radius * (0.72 + progress * 0.72);

	context.save();
	context.globalAlpha = alpha * 0.72;
	context.strokeStyle = style.fill;
	context.lineWidth = 5 * (1 - progress) + 1;
	context.beginPath();
	context.arc(effect.x, effect.y, burstRadius, 0, Math.PI * 2);
	context.stroke();

	context.globalAlpha = alpha * 0.42;
	context.fillStyle = style.fill;
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

function updatePreviews() {
	updatePreview(currentPreview, simulation.currentDropLevel);
	updatePreview(nextPreview, simulation.nextDropLevel);
}

function updatePreview(element: HTMLElement, level: number) {
	const style = styleForFruitLevel(level);
	const radius = simulation.radiusForFruitLevel(level);
	const canvasScale = canvas.getBoundingClientRect().width / canvas.width;

	element.style.setProperty(
		"--fruit-preview-size",
		`${Math.round(radius * 2 * canvasScale)}px`,
	);
	element.style.setProperty("--fruit-preview-fill", style.fill);
	element.style.setProperty("--fruit-preview-stroke", style.stroke);
	element.style.setProperty("--fruit-preview-image", `url("${style.asset}")`);
	element.setAttribute("aria-label", `${style.name} level ${level} fruit`);
}

function updateOverhangWarning() {
	const shouldWarn =
		!simulation.isGameOver &&
		simulation.outOfBoundsOverhang() > simulation.config.warningOverhang;

	if (shouldWarn === isOverhangWarningActive) {
		return;
	}

	isOverhangWarningActive = shouldWarn;
	canvas.classList.toggle("has-overhang-warning", shouldWarn);
}

function admitHighScore(finalScore: number) {
	if (finalScore <= 0) {
		return null;
	}

	const qualifies =
		highScores.length < 3 ||
		finalScore > highScores[highScores.length - 1].score;

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

function styleForFruitLevel(level: number) {
	return fruitStyles[
		clamp(Math.round(level), 1, simulation.config.fruitLevels) - 1
	];
}

function imageForFruitLevel(level: number) {
	return fruitImages[
		clamp(Math.round(level), 1, simulation.config.fruitLevels) - 1
	];
}

function drawFallbackFruit(
	x: number,
	y: number,
	radius: number,
	style: FruitStyle,
) {
	context.beginPath();
	context.arc(x, y, radius, 0, Math.PI * 2);
	context.fillStyle = style.fill;
	context.fill();
	context.lineWidth = 3;
	context.strokeStyle = style.stroke;
	context.stroke();

	context.beginPath();
	context.arc(
		x - radius * 0.28,
		y - radius * 0.32,
		radius * 0.18,
		0,
		Math.PI * 2,
	);
	context.fillStyle = "rgba(255, 255, 255, 0.86)";
	context.fill();
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

function clamp(value: number, min: number, max: number) {
	return Math.max(min, Math.min(max, value));
}

canvas.addEventListener("pointerdown", (event) => {
	addFruit(event.clientX);
});

firehoseButton.addEventListener("click", () => {
	setFirehose(!isFirehoseActive);
});

resetButton.addEventListener("click", () => {
	simulation.reset(performance.now());
	wasGameOver = false;
	isOverhangWarningActive = false;
	setFirehose(false);
	gameOverOverlay.hidden = true;
	canvas.classList.remove("is-game-over");
	canvas.classList.remove("has-overhang-warning");
	syncHud();
});

window.addEventListener("resize", updatePreviews);

syncHud();
updateHighScores();
requestAnimationFrame(gameLoop);
