import './style.css'

type Fruit = {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  radius: number
}

const config = {
  playWidth: 420,
  playHeight: 620,
  fruitRadius: 18,
  gravitySpeed: 980,
  dropCooldownMs: 150,
  wallBounce: 0.08,
  floorBounce: 0.04,
  collisionDamping: 0.34,
  solverPasses: 5,
}

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('Missing #app root')
}

app.innerHTML = `
  <main class="game-shell">
    <section class="game-copy" aria-labelledby="title">
      <p class="eyebrow">first playable prototype</p>
      <h1 id="title">fruition</h1>
      <p class="lede">Click or tap inside the box to drop a plain circle. Same size, no merging, no score, just a jar slowly filling with marbles.</p>
    </section>

    <section class="game-stage" aria-label="fruition prototype">
      <div class="hud">
        <span id="fruit-count">0 fruits</span>
        <button id="reset" type="button">Reset</button>
      </div>
      <canvas id="playfield" width="${config.playWidth}" height="${config.playHeight}" aria-label="clickable play area"></canvas>
    </section>
  </main>
`

const canvas = requiredElement<HTMLCanvasElement>('#playfield')
const resetButton = requiredElement<HTMLButtonElement>('#reset')
const countLabel = requiredElement<HTMLSpanElement>('#fruit-count')
const context = requiredCanvasContext(canvas)

const fruits: Fruit[] = []
let nextFruitId = 1
let previousTime = performance.now()
let lastDropTime = -config.dropCooldownMs

function addFruit(clientX: number) {
  const now = performance.now()

  if (now - lastDropTime < config.dropCooldownMs) {
    return
  }

  lastDropTime = now

  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / rect.width
  const radius = config.fruitRadius
  const x = clamp((clientX - rect.left) * scaleX, radius, canvas.width - radius)

  fruits.push({
    id: nextFruitId++,
    x,
    y: radius + 8,
    vx: 0,
    vy: 0,
    radius,
  })

  updateCount()
}

function updateCount() {
  const noun = fruits.length === 1 ? 'fruit' : 'fruits'
  countLabel.textContent = `${fruits.length} ${noun}`
}

function step(deltaSeconds: number) {
  const dt = Math.min(deltaSeconds, 1 / 30)

  for (const fruit of fruits) {
    fruit.vy += config.gravitySpeed * dt
    fruit.y += fruit.vy * dt
    fruit.x += fruit.vx * dt

    resolveWalls(fruit)
  }

  for (let pass = 0; pass < config.solverPasses; pass += 1) {
    for (let i = 0; i < fruits.length; i += 1) {
      for (let j = i + 1; j < fruits.length; j += 1) {
        resolveFruitPair(fruits[i], fruits[j])
      }
    }

    for (const fruit of fruits) {
      resolveWalls(fruit)
    }
  }

  for (const fruit of fruits) {
    fruit.vx *= 0.995
    if (Math.abs(fruit.vx) < 0.02) {
      fruit.vx = 0
    }
  }
}

function resolveWalls(fruit: Fruit) {
  if (fruit.x - fruit.radius < 0) {
    fruit.x = fruit.radius
    fruit.vx = Math.abs(fruit.vx) * config.wallBounce
  }

  if (fruit.x + fruit.radius > canvas.width) {
    fruit.x = canvas.width - fruit.radius
    fruit.vx = -Math.abs(fruit.vx) * config.wallBounce
  }

  if (fruit.y + fruit.radius > canvas.height) {
    fruit.y = canvas.height - fruit.radius
    fruit.vy = -Math.abs(fruit.vy) * config.floorBounce

    if (Math.abs(fruit.vy) < 18) {
      fruit.vy = 0
    }
  }
}

function resolveFruitPair(a: Fruit, b: Fruit) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const minDistance = a.radius + b.radius
  const distance = Math.hypot(dx, dy)

  if (distance >= minDistance) {
    return
  }

  const normalX = distance === 0 ? 1 : dx / distance
  const normalY = distance === 0 ? 0 : dy / distance
  const overlap = minDistance - distance
  const correction = overlap / 2

  a.x -= normalX * correction
  a.y -= normalY * correction
  b.x += normalX * correction
  b.y += normalY * correction

  const relativeVelocityX = b.vx - a.vx
  const relativeVelocityY = b.vy - a.vy
  const separatingVelocity = relativeVelocityX * normalX + relativeVelocityY * normalY

  if (separatingVelocity > 0) {
    return
  }

  const impulse = (-(1 + config.collisionDamping) * separatingVelocity) / 2
  const impulseX = impulse * normalX
  const impulseY = impulse * normalY

  a.vx -= impulseX
  a.vy -= impulseY
  b.vx += impulseX
  b.vy += impulseY
}

function render() {
  context.clearRect(0, 0, canvas.width, canvas.height)
  drawPlayfield()

  for (const fruit of fruits) {
    drawFruit(fruit)
  }
}

function drawPlayfield() {
  context.fillStyle = '#f7f2df'
  context.fillRect(0, 0, canvas.width, canvas.height)

  context.fillStyle = '#ded5b1'
  context.fillRect(0, canvas.height - 44, canvas.width, 44)

  context.strokeStyle = '#363127'
  context.lineWidth = 4
  context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4)

  context.setLineDash([14, 18])
  context.strokeStyle = 'rgba(54, 49, 39, 0.2)'
  context.lineWidth = 3
  context.beginPath()
  context.moveTo(canvas.width / 2, 22)
  context.lineTo(canvas.width / 2, canvas.height - 24)
  context.stroke()
  context.setLineDash([])
}

function drawFruit(fruit: Fruit) {
  context.beginPath()
  context.arc(fruit.x, fruit.y, fruit.radius, 0, Math.PI * 2)
  context.fillStyle = '#f9f6ed'
  context.fill()
  context.lineWidth = 3
  context.strokeStyle = '#201c17'
  context.stroke()

  context.beginPath()
  context.arc(fruit.x - fruit.radius * 0.28, fruit.y - fruit.radius * 0.32, fruit.radius * 0.18, 0, Math.PI * 2)
  context.fillStyle = 'rgba(255, 255, 255, 0.86)'
  context.fill()
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector)

  if (!element) {
    throw new Error(`Missing required element: ${selector}`)
  }

  return element
}

function requiredCanvasContext(target: HTMLCanvasElement): CanvasRenderingContext2D {
  const renderingContext = target.getContext('2d')

  if (!renderingContext) {
    throw new Error('Canvas rendering context did not initialize')
  }

  return renderingContext
}

function gameLoop(now: number) {
  const deltaSeconds = (now - previousTime) / 1000
  previousTime = now

  step(deltaSeconds)
  render()
  requestAnimationFrame(gameLoop)
}

canvas.addEventListener('pointerdown', (event) => {
  addFruit(event.clientX)
})

resetButton.addEventListener('click', () => {
  fruits.length = 0
  nextFruitId = 1
  updateCount()
})

updateCount()
requestAnimationFrame(gameLoop)
