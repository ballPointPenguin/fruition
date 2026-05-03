import { GameSimulation } from "../src/simulation.js";

declare const process: {
	argv: string[];
};

const runs = Number.parseInt(process.argv[2] ?? "5", 10);
const maxSeconds = Number.parseFloat(process.argv[3] ?? "600");
const stepSeconds = 1 / 60;
const stepMs = stepSeconds * 1000;

for (let run = 1; run <= runs; run += 1) {
	const simulation = new GameSimulation({
		random: mulberry32(run),
		now: 0,
	});
	let now = 0;
	let nextDropAt = 0;

	while (!simulation.isGameOver && now / 1000 < maxSeconds) {
		if (now >= nextDropAt) {
			simulation.dropAt(simulation.config.playWidth / 2, now, {
				enforceCooldown: false,
			});
			nextDropAt += simulation.config.dropCooldownMs;
		}

		simulation.step(stepSeconds, now);
		now += stepMs;
	}

	const seconds = now / 1000;
	const status = simulation.isGameOver ? "game-over" : "max-time";

	console.log(
		[
			`run=${run}`,
			`status=${status}`,
			`seconds=${seconds.toFixed(1)}`,
			`score=${simulation.score}`,
			`drops=${simulation.drops}`,
			`fruits=${simulation.fruits.length}`,
			`overhang=${simulation.outOfBoundsOverhang().toFixed(1)}`,
		].join(" "),
	);
}

function mulberry32(seed: number) {
	let value = seed;

	return () => {
		value |= 0;
		value = (value + 0x6d2b79f5) | 0;
		let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
		mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
		return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
	};
}
