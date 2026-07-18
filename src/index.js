import {
  Client,
  Events,
  GatewayIntentBits,
  AttachmentBuilder,
} from "discord.js";
import dotenv from "dotenv";
import { Jimp, rgbaToInt } from "jimp";
import { GifFrame, GifCodec } from "gifwrap";
import express from "express";
import { GoogleGenAI } from "@google/genai";
const IMAGE_SIZE = 64;
const DEFAULT_FRAME_COUNT = 8;
const DEFAULT_PARTICLE_COUNT = 40;
const DEFAULT_IMAGE_SIZE = 64;
const MAX_ENGINE_COLORS = 8;
const DOT_GIF_TARGET_SIZE = 64;
const DOT_GIF_MAX_COLORS = 16;
const DOT_ALPHA_LEVELS = [0, 64, 128, 192, 255];
const DOT_MIN_PARTICLE_SIZE = 2;
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running.");
});

app.listen(3000, () => {
  console.log("Server Started");
});

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEYが設定されていません。");
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const geminiModel = "gemini-3.5-flash";

//=====================================
// Gemini Utility
//=====================================

const parameterPrompt = `
あなたはゲームエフェクトを生成するAIです。
ユーザーのイメージから、
適切なパラメータを決定してください。
attributesには、既存アルゴリズムを利用する場合だけ fire / poison / ice / thunder / sparkle / wind / water / blast を入れてください。
未実装の抽象的なエフェクトはattributesを空配列にし、particleの特徴で表現してください。
stylesには見た目（sparkle / fantasy / cute / magic / laser / smoke / holy / evil / explosion / beautiful / mysterious / fairy / violent / elegant / crystal / divine / rainbow / dream / flower / galaxyなど）を入れてください。
movementsには動き（up / down / random / circle / rotate / float / spiral / rain / explode / laser / wave / spread / zigzagなど）を入れてください。
colorsにはRGB配列を2～4色入れてください。
particleには、spawn、movement、behavior、spread、speed、life、size、fade、glow、intensity、colorsを指定してください。
modifierは既存属性がある場合の補正値です。intensity、spread、glowを指定できます。
particleCountは、
20～300

frameCountは、
8～32

imageSizeは、
32または64のみ許可します。
必ずJSONのみを返してください。
{
"attributes":[""],
"styles":[""],
"movements":[""],
"colors":[[255,255,255],[255,255,180]],
"particle":{
  "spawn":"center",
  "movement":"float",
  "behavior":"sparkle",
  "spread":0.7,
  "speed":0.6,
  "life":24,
  "size":2,
  "fade":true,
  "glow":true,
  "intensity":1.0,
  "colors":[[255,255,255],[255,180,255],[255,255,180]]
},
"modifier":{"intensity":1.0,"spread":0.0,"glow":false},
"particleCount":0,
"frameCount":0,
"imageSize":0
}


説明文は一切不要です。
JSON以外は出力しないでください。


ユーザー入力：
`;

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

//=====================================
// Fire Effect Utility
//=====================================

function createParticle(imageSize) {
  const maxLife = Math.floor(Math.random() * 6) + 8;
  return {
    x: imageSize / 2 + (Math.random() * 8 - 4),
    y: imageSize - 2,
    vx: Math.random() * 0.6 - 0.3,
    vy: -(Math.random() * 1.5 + 0.5),
    size: Math.floor(Math.random() * 3) + 1,
    maxLife: maxLife,
    life: maxLife,
    alpha: 255,
    type: "fire",
  };
}

function updateParticle(particle) {
  particle.x += particle.vx;
  particle.y += particle.vy;
  //少しだけ揺らぐ
  particle.vx += Math.random() * 0.2 - 0.1;
  particle.life--;
  //透明度を減少
  particle.alpha = Math.floor(255 * (particle.life / particle.maxLife));
  if (particle.alpha < 0) {
    particle.alpha = 0;
  }
}

function isAlive(particle) {
  return particle.life > 0;
}

function getParticleColor(particle) {
  const ratio = particle.life / particle.maxLife;
  let r = 255;
  let g = 0;
  let b = 0;
  //生まれたばかり
  if (ratio > 0.7) {
    //黄色
    r = 255;
    g = 255;
    b = 0;
  }
  //中間
  else if (ratio > 0.4) {
    //橙色
    r = 255;
    g = 140;
    b = 0;
  }
  //消える直前
  else {
    //赤色
    r = 255;
    g = 50;
    b = 0;
  }
  return rgbaToInt(r, g, b, particle.alpha);
}

function drawParticle(image, particle) {
  let drawSize = particle.size;
  //寿命によって大きさを変更
  const ratio = particle.life / particle.maxLife;
  if (ratio < 0.3) {
    drawSize = 1;
  } else if (ratio < 0.6) {
    drawSize = Math.max(particle.size - 1, 1);
  }
  const color = getParticleColor(particle);
  for (let y = 0; y < drawSize; y++) {
    for (let x = 0; x < drawSize; x++) {
      const drawX = Math.floor(particle.x + x);
      const drawY = Math.floor(particle.y + y);
      if (
        drawX >= 0 &&
        drawX < IMAGE_SIZE &&
        drawY >= 0 &&
        drawY < IMAGE_SIZE
      ) {
        image.setPixelColor(color, drawX, drawY);
      }
    }
  }
}

async function generateFireFrames(
  particleCount = DEFAULT_PARTICLE_COUNT,
  frameCount = DEFAULT_FRAME_COUNT,
  imageSize = DEFAULT_IMAGE_SIZE,
) {
  const particles = [];
  for (let i = 0; i < particleCount; i++) {
    particles.push(createParticle(imageSize));
  }
  const frames = [];
  for (let frame = 0; frame < frameCount; frame++) {
    const image = new Jimp({
      width: imageSize,
      height: imageSize,
      color: 0x00000000,
    });
    for (const particle of particles) {
      if (isAlive(particle)) {
        drawParticle(image, particle);
      }
    }

    frames.push(image);

    for (let i = 0; i < particles.length; i++) {
      if (isAlive(particles[i])) {
        updateParticle(particles[i]);
      } else {
        //燃え続けるようにする
        particles[i] = createParticle(imageSize);
      }
    }
  }

  return frames;
}

//=====================================
// Poison Effect Utility
//=====================================

function createPoisonParticle(imageSize) {
  const maxLife = Math.floor(Math.random() * 12) + 18;
  return {
    x: imageSize / 2 + (Math.random() * 10 - 5),
    y: imageSize - 4,
    vx: Math.random() * 0.8 - 0.4,
    vy: -(Math.random() * 0.5 + 0.1),
    size: Math.floor(Math.random() * 3) + 2,
    maxLife: maxLife,
    life: maxLife,
    alpha: 255,
    type: "poison",
  };
}

function updatePoisonParticle(particle) {
  particle.x += particle.vx;
  particle.y += particle.vy;
  //煙のような揺らぎ
  particle.vx += Math.random() * 0.2 - 0.1;
  //左右に流れ過ぎないようにする
  if (particle.vx > 0.8) {
    particle.vx = 0.8;
  }
  if (particle.vx < -0.8) {
    particle.vx = -0.8;
  }
  particle.life--;
  particle.alpha = Math.floor(255 * (particle.life / particle.maxLife));
  if (particle.alpha < 0) {
    particle.alpha = 0;
  }
}

function getPoisonParticleColor(particle) {
  const ratio = particle.life / particle.maxLife;
  let r = 0;
  let g = 0;
  let b = 0;
  //紫
  if (ratio > 0.7) {
    r = 180;
    g = 80;
    b = 255;
  }
  //緑
  else if (ratio > 0.4) {
    r = 50;
    g = 205;
    b = 50;
  }
  //黒紫
  else {
    r = 85;
    g = 26;
    b = 139;
  }
  return rgbaToInt(r, g, b, particle.alpha);
}

function drawPoisonParticle(image, particle) {
  let drawSize = particle.size;
  const ratio = particle.life / particle.maxLife;
  if (ratio < 0.3) {
    drawSize = Math.max(particle.size - 1, 1);
  }
  const color = getPoisonParticleColor(particle);
  for (let y = 0; y < drawSize; y++) {
    for (let x = 0; x < drawSize; x++) {
      const drawX = Math.floor(particle.x + x);
      const drawY = Math.floor(particle.y + y);
      if (
        drawX >= 0 &&
        drawX < IMAGE_SIZE &&
        drawY >= 0 &&
        drawY < IMAGE_SIZE
      ) {
        image.setPixelColor(color, drawX, drawY);
      }
    }
  }
}

async function generatePoisonFrames(
  particleCount = 40,
  frameCount = 8,
  imageSize = 32,
) {
  const particles = [];
  for (let i = 0; i < particleCount; i++) {
    particles.push(createPoisonParticle(imageSize));
  }
  const frames = [];
  for (let frame = 0; frame < frameCount; frame++) {
    const image = new Jimp({
      width: imageSize,
      height: imageSize,
      color: 0x00000000,
    });

    for (const particle of particles) {
      if (isAlive(particle)) {
        drawPoisonParticle(image, particle);
      }
    }

    frames.push(image);

    for (let i = 0; i < particles.length; i++) {
      if (isAlive(particles[i])) {
        updatePoisonParticle(particles[i]);
      } else {
        particles[i] = createPoisonParticle(imageSize);
      }
    }
  }
  return frames;
}

//=====================================
// Ice Effect Utility
//=====================================

function createIceParticle(imageSize) {
  const maxLife = Math.floor(Math.random() * 8) + 12;
  return {
    x: imageSize / 2,
    y: imageSize / 2,
    //少しだけランダムに拡散する
    vx: Math.random() * 2 - 1,
    vy: Math.random() * 2 - 1,
    size: Math.floor(Math.random() * 2) + 1,
    maxLife: maxLife,
    life: maxLife,
    alpha: 255,
    type: "ice",
  };
}
function updateIceParticle(particle) {
  particle.x += particle.vx;
  particle.y += particle.vy;
  particle.life--;
  particle.alpha = Math.floor(255 * (particle.life / particle.maxLife));
  if (particle.alpha < 0) {
    particle.alpha = 0;
  }
}

function getIceParticleColor(particle) {
  const ratio = particle.life / particle.maxLife;
  let r = 255;
  let g = 255;
  let b = 255;
  //生まれたばかり
  if (ratio > 0.7) {
    //白色
    r = 255;
    g = 255;
    b = 255;
  }
  //中間
  else if (ratio > 0.4) {
    //水色
    r = 180;
    g = 255;
    b = 255;
  }
  //消える直前
  else {
    //少し青みを強くする
    r = 120;
    g = 220;
    b = 255;
  }
  return rgbaToInt(r, g, b, particle.alpha);
}
function drawIceParticle(image, particle) {
  let drawSize = particle.size;
  const ratio = particle.life / particle.maxLife;
  if (ratio < 0.3) {
    drawSize = 1;
  }
  const color = getIceParticleColor(particle);
  for (let y = 0; y < drawSize; y++) {
    for (let x = 0; x < drawSize; x++) {
      const drawX = Math.floor(particle.x + x);
      const drawY = Math.floor(particle.y + y);
      if (
        drawX >= 0 &&
        drawX < IMAGE_SIZE &&
        drawY >= 0 &&
        drawY < IMAGE_SIZE
      ) {
        image.setPixelColor(color, drawX, drawY);
      }
    }
  }
}
async function generateIceFrames(
  particleCount = 40,
  frameCount = 8,
  imageSize = 32,
) {
  const particles = [];
  for (let i = 0; i < particleCount; i++) {
    particles.push(createIceParticle(imageSize));
  }
  const frames = [];
  for (let frame = 0; frame < frameCount; frame++) {
    const image = new Jimp({
      width: imageSize,
      height: imageSize,
      color: 0x00000000,
    });
    for (const particle of particles) {
      if (isAlive(particle)) {
        drawIceParticle(image, particle);
      }
    }
    frames.push(image);
    for (let i = 0; i < particles.length; i++) {
      if (isAlive(particles[i])) {
        updateIceParticle(particles[i]);
      } else {
        particles[i] = createIceParticle(imageSize);
      }
    }
  }
  return frames;
}

//=====================================
// Thunder Effect Utility
//=====================================

function createThunderParticle(imageSize) {
  const maxLife = Math.floor(Math.random() * 4) + 5;
  return {
    x: imageSize / 2,
    y: imageSize / 2,
    vx: Math.random() * 4 - 2,
    vy: Math.random() * 4 - 2,
    size: Math.floor(Math.random() * 2) + 1,
    maxLife,
    life: maxLife,
    alpha: 255,
    type: "thunder",
  };
}

function updateThunderParticle(particle) {
  particle.x += particle.vx;
  particle.y += particle.vy;
  //放電を表現するために、
  //毎Frame少しだけ進行方向を変える
  particle.vx += Math.random() * 0.8 - 0.4;
  particle.vy += Math.random() * 0.8 - 0.4;
  particle.life--;
  particle.alpha = Math.floor(255 * (particle.life / particle.maxLife));
  if (particle.alpha < 0) {
    particle.alpha = 0;
  }
}
function getThunderParticleColor(particle) {
  const ratio = particle.life / particle.maxLife;
  let r = 255;
  let g = 255;
  let b = 255;

  if (ratio > 0.7) {
    //白色
    r = 255;
    g = 255;
    b = 255;
  } else if (ratio > 0.4) {
    //黄色
    r = 255;
    g = 255;
    b = 0;
  } else {
    //少し橙色
    r = 255;
    g = 220;
    b = 80;
  }
  return rgbaToInt(r, g, b, particle.alpha);
}

function drawThunderParticle(image, particle) {
  const color = getThunderParticleColor(particle);
  for (let y = 0; y < particle.size; y++) {
    for (let x = 0; x < particle.size; x++) {
      const drawX = Math.floor(particle.x + x);
      const drawY = Math.floor(particle.y + y);
      if (
        drawX >= 0 &&
        drawX < IMAGE_SIZE &&
        drawY >= 0 &&
        drawY < IMAGE_SIZE
      ) {
        image.setPixelColor(color, drawX, drawY);
      }
    }
  }
}
async function generateThunderFrames(
  particleCount = 50,
  frameCount = 8,
  imageSize = 32,
) {
  const particles = [];
  for (let i = 0; i < particleCount; i++) {
    particles.push(createThunderParticle(imageSize));
  }
  const frames = [];
  for (let frame = 0; frame < frameCount; frame++) {
    const image = new Jimp({
      width: imageSize,
      height: imageSize,
      color: 0x00000000,
    });
    for (const particle of particles) {
      if (isAlive(particle)) {
        drawThunderParticle(image, particle);
      }
    }
    frames.push(image);
    for (let i = 0; i < particles.length; i++) {
      if (isAlive(particles[i])) {
        updateThunderParticle(particles[i]);
      } else {
        particles[i] = createThunderParticle(imageSize);
      }
    }
  }
  return frames;
}

//=====================================
// Sparkle Effect Utility
//=====================================

function createSparkleParticle(imageSize) {
  const maxLife = Math.floor(Math.random() * 10) + 14;
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.random() * (imageSize * 0.22);
  return {
    x: imageSize / 2 + Math.cos(angle) * radius,
    y: imageSize / 2 + Math.sin(angle) * radius,
    vx: (Math.random() - 0.5) * 0.5,
    vy: -(Math.random() * 0.6 + 0.1),
    size: Math.random() > 0.82 ? 2 : 1,
    twinkleSeed: Math.random() * Math.PI * 2,
    maxLife,
    life: maxLife,
    alpha: 255,
    type: "sparkle",
  };
}

function updateSparkleParticle(particle) {
  particle.x += particle.vx;
  particle.y += particle.vy;
  particle.vx += (Math.random() - 0.5) * 0.08;
  particle.vy += Math.sin((particle.maxLife - particle.life) * 0.4 + particle.twinkleSeed) * 0.03;
  particle.life--;
  particle.alpha = Math.floor(255 * (particle.life / particle.maxLife));
  if (particle.alpha < 0) particle.alpha = 0;
}

function getSparkleColor(particle) {
  const ratio = particle.life / particle.maxLife;
  const twinkle = 0.75 + Math.sin((particle.maxLife - particle.life) * 0.9 + particle.twinkleSeed) * 0.25;
  let r = 255;
  let g = 255;
  let b = 255;
  if (ratio > 0.66) {
    r = 255;
    g = 245;
    b = 180;
  } else if (ratio > 0.33) {
    r = 220;
    g = 245;
    b = 255;
  } else {
    r = 255;
    g = 210;
    b = 250;
  }
  const alpha = Math.max(0, Math.min(255, Math.floor(particle.alpha * twinkle)));
  return rgbaToInt(r, g, b, alpha);
}

function drawSparkleParticle(image, particle, imageSize) {
  const color = getSparkleColor(particle);
  const x = Math.floor(particle.x);
  const y = Math.floor(particle.y);
  if (x >= 0 && x < imageSize && y >= 0 && y < imageSize) {
    image.setPixelColor(color, x, y);
  }
  const glowColor = rgbaToInt(255, 255, 255, Math.floor(particle.alpha * 0.35));
  const glowTargets = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
  for (const [gx, gy] of glowTargets) {
    if (gx >= 0 && gx < imageSize && gy >= 0 && gy < imageSize) {
      image.setPixelColor(glowColor, gx, gy);
    }
  }
}

async function generateSparkleFrames(
  particleCount = DEFAULT_PARTICLE_COUNT,
  frameCount = DEFAULT_FRAME_COUNT,
  imageSize = DEFAULT_IMAGE_SIZE,
) {
  const particles = [];
  for (let i = 0; i < particleCount; i++) particles.push(createSparkleParticle(imageSize));
  const frames = [];

  for (let frame = 0; frame < frameCount; frame++) {
    const image = new Jimp({ width: imageSize, height: imageSize, color: 0x00000000 });
    for (const particle of particles) {
      if (isAlive(particle)) drawSparkleParticle(image, particle, imageSize);
    }
    frames.push(image);
    for (let i = 0; i < particles.length; i++) {
      if (isAlive(particles[i])) updateSparkleParticle(particles[i]);
      else particles[i] = createSparkleParticle(imageSize);
    }
  }
  return frames;
}

//=====================================
// Wind Effect Utility
//=====================================

function createWindParticle(imageSize) {
  const maxLife = Math.floor(Math.random() * 10) + 12;
  const x = Math.random() * imageSize;
  const y = imageSize / 2 + (Math.random() - 0.5) * imageSize * 0.6;
  return {
    x,
    y,
    vx: Math.random() * 1.6 + 0.9,
    vy: (Math.random() - 0.5) * 0.25,
    phase: Math.random() * Math.PI * 2,
    size: Math.random() > 0.7 ? 2 : 1,
    maxLife,
    life: maxLife,
    alpha: 255,
    type: "wind",
  };
}

function updateWindParticle(particle) {
  particle.x += particle.vx;
  particle.y += particle.vy + Math.sin((particle.maxLife - particle.life) * 0.45 + particle.phase) * 0.35;
  particle.vx += (Math.random() - 0.45) * 0.12;
  if (particle.vx < 0.7) particle.vx = 0.7;
  if (particle.vx > 2.6) particle.vx = 2.6;
  particle.life--;
  particle.alpha = Math.floor(255 * (particle.life / particle.maxLife));
  if (particle.alpha < 0) particle.alpha = 0;
}

function drawWindParticle(image, particle, imageSize) {
  const color = rgbaToInt(205, 240, 255, particle.alpha);
  const x = Math.floor(particle.x);
  const y = Math.floor(particle.y);
  for (let i = 0; i < particle.size + 1; i++) {
    const tx = x - i;
    if (tx >= 0 && tx < imageSize && y >= 0 && y < imageSize) {
      const tailAlpha = Math.floor(particle.alpha * (1 - i / (particle.size + 2)));
      image.setPixelColor(rgbaToInt(180, 230, 255, tailAlpha), tx, y);
    }
  }
  if (x >= 0 && x < imageSize && y >= 0 && y < imageSize) image.setPixelColor(color, x, y);
}

async function generateWindFrames(
  particleCount = DEFAULT_PARTICLE_COUNT,
  frameCount = DEFAULT_FRAME_COUNT,
  imageSize = DEFAULT_IMAGE_SIZE,
) {
  const particles = [];
  for (let i = 0; i < particleCount; i++) particles.push(createWindParticle(imageSize));
  const frames = [];

  for (let frame = 0; frame < frameCount; frame++) {
    const image = new Jimp({ width: imageSize, height: imageSize, color: 0x00000000 });
    for (const particle of particles) {
      if (isAlive(particle)) drawWindParticle(image, particle, imageSize);
    }
    frames.push(image);
    for (let i = 0; i < particles.length; i++) {
      if (isAlive(particles[i])) {
        updateWindParticle(particles[i]);
      } else {
        particles[i] = createWindParticle(imageSize);
      }
      if (particles[i].x > imageSize + 2) particles[i] = createWindParticle(imageSize);
    }
  }
  return frames;
}

//=====================================
// Water Effect Utility
//=====================================

function createWaterParticle(imageSize) {
  const maxLife = Math.floor(Math.random() * 10) + 14;
  return {
    x: imageSize / 2 + (Math.random() - 0.5) * imageSize * 0.3,
    y: imageSize - 2,
    vx: (Math.random() - 0.5) * 1.2,
    vy: -(Math.random() * 2 + 1.2),
    gravity: 0.1 + Math.random() * 0.05,
    size: Math.random() > 0.6 ? 2 : 1,
    maxLife,
    life: maxLife,
    alpha: 255,
    type: "water",
  };
}

function updateWaterParticle(particle, imageSize) {
  particle.x += particle.vx;
  particle.y += particle.vy;
  particle.vy += particle.gravity;
  particle.vx *= 0.985;
  if (particle.y >= imageSize - 2) {
    particle.y = imageSize - 2;
    particle.vy *= -0.45;
    particle.vx *= 0.7;
  }
  particle.life--;
  particle.alpha = Math.floor(255 * (particle.life / particle.maxLife));
  if (particle.alpha < 0) particle.alpha = 0;
}

function getWaterParticleColor(particle) {
  const ratio = particle.life / particle.maxLife;
  let r = 120;
  let g = 210;
  let b = 255;
  if (ratio > 0.66) {
    r = 200;
    g = 245;
    b = 255;
  } else if (ratio < 0.28) {
    r = 70;
    g = 170;
    b = 240;
  }
  return rgbaToInt(r, g, b, particle.alpha);
}

function drawWaterParticle(image, particle, imageSize) {
  const color = getWaterParticleColor(particle);
  const x = Math.floor(particle.x);
  const y = Math.floor(particle.y);
  for (let yy = 0; yy < particle.size; yy++) {
    for (let xx = 0; xx < particle.size; xx++) {
      const tx = x + xx;
      const ty = y + yy;
      if (tx >= 0 && tx < imageSize && ty >= 0 && ty < imageSize) {
        image.setPixelColor(color, tx, ty);
      }
    }
  }
}

async function generateWaterFrames(
  particleCount = DEFAULT_PARTICLE_COUNT,
  frameCount = DEFAULT_FRAME_COUNT,
  imageSize = DEFAULT_IMAGE_SIZE,
) {
  const particles = [];
  for (let i = 0; i < particleCount; i++) particles.push(createWaterParticle(imageSize));
  const frames = [];

  for (let frame = 0; frame < frameCount; frame++) {
    const image = new Jimp({ width: imageSize, height: imageSize, color: 0x00000000 });
    for (const particle of particles) {
      if (isAlive(particle)) drawWaterParticle(image, particle, imageSize);
    }
    frames.push(image);
    for (let i = 0; i < particles.length; i++) {
      if (isAlive(particles[i])) updateWaterParticle(particles[i], imageSize);
      else particles[i] = createWaterParticle(imageSize);
    }
  }
  return frames;
}

//=====================================
// Blast Effect Utility
//=====================================

function createBlastParticle(imageSize) {
  const maxLife = Math.floor(Math.random() * 5) + 6;
  const angle = Math.random() * Math.PI * 2;
  const speed = Math.random() * 3.6 + 2.1;
  return {
    x: imageSize / 2,
    y: imageSize / 2,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size: Math.random() > 0.75 ? 2 : 1,
    maxLife,
    life: maxLife,
    alpha: 255,
    type: "blast",
  };
}

function updateBlastParticle(particle) {
  particle.x += particle.vx;
  particle.y += particle.vy;
  particle.vx *= 0.92;
  particle.vy *= 0.92;
  particle.life--;
  particle.alpha = Math.floor(255 * (particle.life / particle.maxLife));
  if (particle.alpha < 0) particle.alpha = 0;
}

function getBlastParticleColor(particle) {
  const ratio = particle.life / particle.maxLife;
  let r = 255;
  let g = 255;
  let b = 220;
  if (ratio > 0.66) {
    r = 255;
    g = 255;
    b = 240;
  } else if (ratio > 0.33) {
    r = 255;
    g = 170;
    b = 80;
  } else {
    r = 210;
    g = 70;
    b = 45;
  }
  return rgbaToInt(r, g, b, particle.alpha);
}

function drawBlastParticle(image, particle, imageSize) {
  const color = getBlastParticleColor(particle);
  const x = Math.floor(particle.x);
  const y = Math.floor(particle.y);
  for (let yy = 0; yy < particle.size; yy++) {
    for (let xx = 0; xx < particle.size; xx++) {
      const tx = x + xx;
      const ty = y + yy;
      if (tx >= 0 && tx < imageSize && ty >= 0 && ty < imageSize) {
        image.setPixelColor(color, tx, ty);
      }
    }
  }
}

async function generateBlastFrames(
  particleCount = DEFAULT_PARTICLE_COUNT,
  frameCount = DEFAULT_FRAME_COUNT,
  imageSize = DEFAULT_IMAGE_SIZE,
) {
  const particles = [];
  for (let i = 0; i < particleCount; i++) particles.push(createBlastParticle(imageSize));
  const frames = [];
  for (let frame = 0; frame < frameCount; frame++) {
    const image = new Jimp({ width: imageSize, height: imageSize, color: 0x00000000 });
    for (const particle of particles) {
      if (isAlive(particle)) drawBlastParticle(image, particle, imageSize);
    }
    frames.push(image);
    for (let i = 0; i < particles.length; i++) {
      if (isAlive(particles[i])) updateBlastParticle(particles[i]);
      else particles[i] = createBlastParticle(imageSize);
    }
  }
  return frames;
}

//=====================================
// Utility
//=====================================

async function convertFrameToPNG(frame) {
  return await frame.getBuffer("image/png");
}

async function createPNGFile(frame, fileName) {
  const buffer = await convertFrameToPNG(frame);

  return new AttachmentBuilder(
    buffer,

    {
      name: fileName,
    },
  );
}

async function generateParameter(userPrompt) {
  const response = await ai.models.generateContent({
    model: geminiModel,
    contents: parameterPrompt + "\n" + userPrompt,
  });
  console.log(response.text);
  return response.text ?? "";
}

function parseParameter(text) {
  const jsonText = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();
  const parameter = JSON.parse(jsonText);
  const attributes = Array.isArray(parameter.attributes)
    ? parameter.attributes
    : parameter.attribute ? [parameter.attribute] : [];
  if (attributes.length === 0 && (!Array.isArray(parameter.styles) || parameter.styles.length === 0)) {
    throw new Error("attributesまたはstylesが指定されていません。");
  }

  return {
    ...parameter,
    attributes: attributes.map((attribute) => String(attribute).toLowerCase()),
    styles: Array.isArray(parameter.styles) ? parameter.styles.map((style) => String(style).toLowerCase()) : [],
    movements: Array.isArray(parameter.movements)
      ? parameter.movements.map((movement) => String(movement).toLowerCase())
      : parameter.particle?.movement ? [String(parameter.particle.movement).toLowerCase()] : ["spread"],
    colors: (Array.isArray(parameter.colors)
      ? parameter.colors
      : Array.isArray(parameter.particle?.colors) ? parameter.particle.colors : [[255, 255, 255]])
      .filter((color) => Array.isArray(color) && color.length === 3)
      .map((color) => color.map((value) => Math.max(0, Math.min(255, Math.floor(Number(value) || 0))))),
    particle: parameter.particle && typeof parameter.particle === "object" ? parameter.particle : {},
    modifier: parameter.modifier && typeof parameter.modifier === "object" ? parameter.modifier : {},
    particleCount: Math.max(20, Math.min(Math.floor(Number(parameter.particleCount) || DEFAULT_PARTICLE_COUNT), 300)),
    frameCount: Math.max(8, Math.min(Math.floor(Number(parameter.frameCount) || DEFAULT_FRAME_COUNT), 32)),
    imageSize: [32, 64].includes(Number(parameter.imageSize)) ? Number(parameter.imageSize) : DEFAULT_IMAGE_SIZE,
  };
}

function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function quantizeAlphaLevel(alpha, levels = DOT_ALPHA_LEVELS) {
  const value = Math.max(0, Math.min(255, Math.floor(Number(alpha) || 0)));
  let nearest = levels[0];
  let minDiff = Math.abs(value - levels[0]);
  for (let i = 1; i < levels.length; i++) {
    const diff = Math.abs(value - levels[i]);
    if (diff < minDiff) {
      nearest = levels[i];
      minDiff = diff;
    }
  }
  return nearest;
}

function normalizeColorList(colors, fallback = [[255, 255, 255]]) {
  const normalized = (Array.isArray(colors) ? colors : [])
    .filter((color) => Array.isArray(color) && color.length === 3)
    .map((color) => color.map((value) => Math.max(0, Math.min(255, Math.floor(Number(value) || 0)))))
    .slice(0, MAX_ENGINE_COLORS);
  return normalized.length > 0
    ? normalized
    : normalizeColorList(fallback, [[255, 255, 255]]);
}

function normalizeModifier(modifier) {
  const source = modifier && typeof modifier === "object" ? modifier : {};
  return {
    intensity: clamp(source.intensity, 0.4, 2.4, 1),
    spread: clamp(source.spread, 0, 1.4, 0),
    glow: source.glow === true,
  };
}

// 未実装属性向けに、GeminiのParticle特徴JSONだけで多層エフェクトを構築する。
function createEffectProfile(parameter, options = {}) {
  const { decorationOnly = false } = options;
  const styles = new Set(parameter.styles);
  const particle = parameter.particle;
  const explicitMovements = Array.isArray(parameter.movements) ? parameter.movements : ["spread"];
  const movements = new Set(particle.movement ? [String(particle.movement).toLowerCase()] : explicitMovements);
  if (styles.has("laser")) movements.add("laser");
  if (styles.has("explosion") || styles.has("violent")) movements.add("explode");
  if (styles.has("sparkle") || styles.has("fantasy") || styles.has("cute") || styles.has("magic") || styles.has("fairy") || styles.has("flower") || styles.has("holy") || styles.has("divine")) movements.add("float");
  if (styles.has("galaxy")) movements.add("rotate");
  if (styles.has("smoke")) movements.add("random");
  const colors = normalizeColorList(
    Array.isArray(particle.colors) ? particle.colors : parameter.colors,
    [[255, 255, 255], [255, 230, 170]],
  );
  const isLaser = styles.has("laser") || movements.has("laser");
  const isRain = movements.has("rain") || movements.has("down");
  const isExplosion = styles.has("explosion") || movements.has("explode");
  const isSparkle = styles.has("sparkle") || styles.has("magic") || styles.has("fairy") || styles.has("crystal");
  const modifier = normalizeModifier(parameter.modifier);
  const particleIntensity = clamp(particle.intensity, 0.5, 2.4, 1);
  const baseIntensity = decorationOnly ? Math.min(1.25, particleIntensity) : particleIntensity;

  return {
    styles,
    movements,
    decorationOnly,
    spawn: ["center", "top", "bottom", "left"].includes(particle.spawn)
      ? particle.spawn : isLaser ? "left" : isRain ? "top" : "center",
    speed: clamp(particle.speed, 0.05, 4, isLaser ? 2.5 : isExplosion ? 1.7 : styles.has("smoke") ? 0.35 : 0.85),
    life: Math.floor(clamp(particle.life, 4, 70, isLaser ? 12 : styles.has("smoke") ? 30 : 22)),
    size: Math.floor(clamp(particle.size, DOT_MIN_PARTICLE_SIZE, 8, isLaser ? DOT_MIN_PARTICLE_SIZE : styles.has("smoke") ? 3 : 2)),
    spread: clamp(particle.spread, 0, 2, decorationOnly ? 0.55 : 0.85),
    behavior: ["sparkle", "smoke", "pulse", "trail", "flicker"].includes(particle.behavior)
      ? particle.behavior : isSparkle ? "sparkle" : styles.has("smoke") ? "smoke" : "pulse",
    fade: particle.fade !== false,
    glow: particle.glow === true || isSparkle || styles.has("holy") || styles.has("divine") || styles.has("galaxy") || styles.has("rainbow"),
    alphaMultiplier: styles.has("evil") || styles.has("mysterious") ? 0.75 : 1,
    intensity: baseIntensity,
    modifier,
    colors,
  };
}

function createEngineLayerProfiles(profile, particleCount) {
  const isExplosive = profile.movements.has("explode") || profile.styles.has("violent");
  const hasSparkle = profile.behavior === "sparkle" || profile.styles.has("magic") || profile.styles.has("holy") || profile.styles.has("divine") || profile.styles.has("galaxy") || profile.styles.has("rainbow");
  const hasSmoke = profile.behavior === "smoke" || profile.styles.has("smoke");
  const baseCount = Math.max(1, Math.floor(particleCount * (profile.decorationOnly ? 0.45 : 1) * profile.intensity));

  const layers = [
    {
      count: Math.max(8, Math.floor(baseCount * (isExplosive ? 0.52 : 0.62))),
      speedScale: isExplosive ? 1.2 : 1,
      sizeBias: 0,
      lifeScale: 1,
      spreadScale: 1,
      behavior: profile.behavior,
      glowBoost: 0,
    },
    {
      count: Math.max(6, Math.floor(baseCount * 0.26)),
      speedScale: hasSmoke ? 0.55 : 0.82,
      sizeBias: hasSmoke ? 1 : 0,
      lifeScale: hasSmoke ? 1.35 : 1.15,
      spreadScale: 1.25,
      behavior: hasSmoke ? "smoke" : "trail",
      glowBoost: 0,
    },
  ];

  if (hasSparkle && !profile.decorationOnly) {
    layers.push({
      count: Math.max(4, Math.floor(baseCount * 0.22)),
      speedScale: 0.9,
      sizeBias: -1,
      lifeScale: 0.95,
      spreadScale: 0.8,
      behavior: "sparkle",
      glowBoost: 0.2,
    });
  }

  return layers;
}

function createEngineParticle(profile, imageSize, layer) {
  const angle = Math.random() * Math.PI * 2;
  const movements = profile.movements;
  const speed = profile.speed * layer.speedScale;
  const spread = profile.spread * layer.spreadScale;
  let vx = Math.cos(angle) * speed;
  let vy = Math.sin(angle) * speed;

  if (movements.has("up")) {
    vx = (Math.random() - 0.5) * speed * 0.7;
    vy = -speed;
  }
  if (movements.has("down") || movements.has("rain")) {
    vx = (Math.random() - 0.5) * speed * 0.35;
    vy = speed;
  }
  if (movements.has("spread") || movements.has("explode")) {
    vx *= 1 + spread * 0.4;
    vy *= 1 + spread * 0.4;
  }
  if (movements.has("laser")) {
    vx = speed * 2;
    vy = (Math.random() - 0.5) * Math.max(0.15, spread * 0.4);
  }

  let x = imageSize / 2;
  let y = imageSize / 2;
  if (profile.spawn === "left") {
    x = 0;
    y = imageSize / 2 + (Math.random() - 0.5) * imageSize * 0.6;
  } else if (profile.spawn === "top") {
    x = imageSize / 2 + (Math.random() - 0.5) * imageSize * 0.6;
    y = 0;
  } else if (profile.spawn === "bottom") {
    x = imageSize / 2 + (Math.random() - 0.5) * imageSize * 0.6;
    y = imageSize - 1;
  } else {
    x = imageSize / 2 + (Math.random() - 0.5) * imageSize * spread * 0.5;
    y = imageSize / 2 + (Math.random() - 0.5) * imageSize * spread * 0.5;
  }

  const baseLife = Math.max(4, Math.floor(profile.life * layer.lifeScale));
  const baseSize = Math.max(DOT_MIN_PARTICLE_SIZE, profile.size + layer.sizeBias);
  return {
    x,
    y,
    vx,
    vy,
    angle,
    baseSize,
    orbitRadius: 1 + Math.random() * imageSize * spread * 0.35,
    orbitSpeed: 0.04 + Math.random() * speed * 0.09,
    maxLife: baseLife + Math.floor(Math.random() * Math.max(2, baseLife * 0.4)),
    life: 0,
    size: Math.max(1, baseSize + Math.floor(Math.random() * 2) - 1),
    behavior: layer.behavior,
    glowBoost: layer.glowBoost,
    twinkleSeed: Math.random() * Math.PI * 2,
    profile,
  };
}

function updateEngineParticle(particle, imageSize) {
  const { profile } = particle;
  const { movements } = profile;
  if (movements.has("circle") || movements.has("rotate") || movements.has("spiral")) {
    particle.angle += particle.orbitSpeed;
    if (movements.has("spiral")) particle.orbitRadius += Math.max(0.08, profile.speed * 0.08);
    particle.x = imageSize / 2 + Math.cos(particle.angle) * particle.orbitRadius;
    particle.y = imageSize / 2 + Math.sin(particle.angle) * particle.orbitRadius;
  } else {
    particle.x += particle.vx;
    particle.y += particle.vy;
  }
  if (movements.has("random")) {
    particle.vx += (Math.random() - 0.5) * profile.speed * 0.3;
    particle.vy += (Math.random() - 0.5) * profile.speed * 0.3;
  }
  if (movements.has("float") || movements.has("wave")) particle.y += Math.sin(particle.life * 0.4 + particle.angle) * 0.45;
  if (movements.has("zigzag")) particle.x += Math.sin(particle.life * 0.8) * profile.speed;
  particle.life++;
}

function drawEnginePixel(image, x, y, color, imageSize) {
  if (x >= 0 && x < imageSize && y >= 0 && y < imageSize) image.setPixelColor(color, x, y);
}

function drawEngineParticle(image, particle, imageSize) {
  const { profile } = particle;
  const ratio = Math.max(0, 1 - particle.life / particle.maxLife);
  const colorIndex = Math.min(profile.colors.length - 1, Math.floor((1 - ratio) * profile.colors.length));
  const [r, g, b] = profile.colors[colorIndex];
  const baseAlpha = 255 * ratio * profile.alphaMultiplier * profile.intensity;
  const twinkle = 0.75 + Math.sin(particle.life * 0.7 + particle.twinkleSeed) * 0.25;
  const behaviorScale = particle.behavior === "flicker"
    ? Math.max(0.4, Math.random())
    : particle.behavior === "sparkle"
      ? twinkle
      : 1;
  const alpha = quantizeAlphaLevel(Math.floor(baseAlpha * behaviorScale));
  let drawSize = ratio < 0.25 ? 1 : particle.size;
  if (particle.behavior === "pulse") {
    drawSize = Math.max(1, Math.floor(particle.baseSize + Math.sin(particle.life * 0.5 + particle.twinkleSeed) * 0.9));
  }
  if (particle.behavior === "trail") {
    drawSize = Math.max(1, Math.floor(drawSize * 0.9));
  }
  if (ratio > 0.25) {
    drawSize = Math.max(2, drawSize);
  }
  const drawX = Math.floor(particle.x);
  const drawY = Math.floor(particle.y);
  if (profile.glow) {
    const glowAlpha = quantizeAlphaLevel(Math.floor(alpha * (0.34 + particle.glowBoost)));
    const glowColor = rgbaToInt(r, g, b, Math.max(0, Math.min(255, glowAlpha)));
    const radius = drawSize > 1 ? 1 : 0;
    drawEnginePixel(image, drawX - 1, drawY, glowColor, imageSize);
    drawEnginePixel(image, drawX + drawSize, drawY, glowColor, imageSize);
    drawEnginePixel(image, drawX, drawY - 1, glowColor, imageSize);
    drawEnginePixel(image, drawX, drawY + drawSize, glowColor, imageSize);
    if (radius > 0) {
      drawEnginePixel(image, drawX - 1, drawY - 1, glowColor, imageSize);
      drawEnginePixel(image, drawX + drawSize, drawY - 1, glowColor, imageSize);
      drawEnginePixel(image, drawX - 1, drawY + drawSize, glowColor, imageSize);
      drawEnginePixel(image, drawX + drawSize, drawY + drawSize, glowColor, imageSize);
    }
  }
  const color = rgbaToInt(r, g, b, alpha);
  for (let y = 0; y < drawSize; y++) {
    for (let x = 0; x < drawSize; x++) drawEnginePixel(image, drawX + x, drawY + y, color, imageSize);
  }
}

class ParticleEngine {
  constructor(parameter, options = {}) {
    this.parameter = parameter;
    this.decorationOnly = options.decorationOnly === true;
  }

  async generateFrames() {
    const { parameter } = this;
    const profile = createEffectProfile(parameter, { decorationOnly: this.decorationOnly });
    const layers = createEngineLayerProfiles(profile, parameter.particleCount);
    const particleSets = layers.map((layer) => {
      return Array.from({ length: layer.count }, () => createEngineParticle(profile, parameter.imageSize, layer));
    });
    const frames = [];
    for (let frame = 0; frame < parameter.frameCount; frame++) {
      const image = new Jimp({ width: parameter.imageSize, height: parameter.imageSize, color: 0x00000000 });
      for (let layerIndex = 0; layerIndex < particleSets.length; layerIndex++) {
        const particles = particleSets[layerIndex];
        const layer = layers[layerIndex];
        for (let i = 0; i < particles.length; i++) {
          const particle = particles[i];
          if (particle.life < particle.maxLife) drawEngineParticle(image, particle, parameter.imageSize);
          else particles[i] = createEngineParticle(particle.profile, parameter.imageSize, layer);
        }
      }
      frames.push(image);
      for (const particles of particleSets) for (const particle of particles) updateEngineParticle(particle, parameter.imageSize);
    }
    return frames;
  }
}

// 既存属性は完成済みの生成処理をそのまま利用する。属性合成だけをここで行う。
const ATTRIBUTE_FRAME_GENERATORS = {
  fire: generateFireFrames,
  poison: generatePoisonFrames,
  ice: generateIceFrames,
  thunder: generateThunderFrames,
  sparkle: generateSparkleFrames,
  wind: generateWindFrames,
  water: generateWaterFrames,
  blast: generateBlastFrames,
};

const EXISTING_ATTRIBUTES = new Set(Object.keys(ATTRIBUTE_FRAME_GENERATORS));

function getAttributeParticleCount(parameter) {
  const styles = new Set(parameter.styles);
  const multiplier = styles.has("violent") || styles.has("explosion") ? 1.35 : 1;
  return Math.min(300, Math.floor(parameter.particleCount * multiplier));
}

async function combineFrameGroups(frameGroups, frameCount, imageSize) {
  const frames = [];
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
    const image = new Jimp({ width: imageSize, height: imageSize, color: 0x00000000 });
    for (const group of frameGroups) image.composite(group[frameIndex], 0, 0);
    frames.push(image);
  }
  return frames;
}

function hasModifierEffect(modifier) {
  return modifier.intensity !== 1 || modifier.spread > 0 || modifier.glow;
}

async function applyModifierToExistingFrames(frames, modifier, imageSize) {
  if (!hasModifierEffect(modifier)) return frames;
  const spreadPixels = Math.max(0, Math.floor(modifier.spread * (imageSize >= 64 ? 3 : 2)));
  const result = [];

  for (const frame of frames) {
    const image = new Jimp({ width: imageSize, height: imageSize, color: 0x00000000 });
    image.composite(frame, 0, 0);

    if (spreadPixels > 0) {
      image.composite(frame, spreadPixels, 0, { opacitySource: 0.32 });
      image.composite(frame, -spreadPixels, 0, { opacitySource: 0.32 });
      image.composite(frame, 0, spreadPixels, { opacitySource: 0.28 });
      image.composite(frame, 0, -spreadPixels, { opacitySource: 0.28 });
    }

    if (modifier.glow) {
      image.composite(frame, 1, 0, { opacitySource: 0.35 });
      image.composite(frame, -1, 0, { opacitySource: 0.35 });
      image.composite(frame, 0, 1, { opacitySource: 0.35 });
      image.composite(frame, 0, -1, { opacitySource: 0.35 });
    }

    if (modifier.intensity !== 1) {
      const data = image.bitmap.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i + 3] = Math.max(0, Math.min(255, Math.floor(data[i + 3] * modifier.intensity)));
      }
    }

    result.push(image);
  }

  return result;
}

function needsDecoration(parameter, hasExistingAttribute) {
  if (!hasExistingAttribute) return false;
  const decorativeStyles = new Set(["sparkle", "fantasy", "cute", "magic", "fairy", "crystal", "divine", "galaxy", "rainbow"]);
  const decorativeMovements = new Set(["rain", "float", "circle", "rotate", "spiral", "wave", "zigzag", "spread"]);
  return parameter.styles.some((style) => decorativeStyles.has(style))
    || parameter.movements.some((movement) => decorativeMovements.has(movement));
}

async function generateFramesByAttribute(parameter) {
  const attributes = Array.isArray(parameter.attributes) ? parameter.attributes : [];
  const particleCount = getAttributeParticleCount(parameter);
  const frameGroups = [];
  const knownAttributes = attributes.filter((attribute) => EXISTING_ATTRIBUTES.has(attribute));
  const hasExistingAttribute = knownAttributes.length > 0;
  const modifier = normalizeModifier(parameter.modifier);

  for (const attribute of knownAttributes) {
    const generator = ATTRIBUTE_FRAME_GENERATORS[attribute];
    let frames = await generator(particleCount, parameter.frameCount, parameter.imageSize);
    frames = await applyModifierToExistingFrames(frames, modifier, parameter.imageSize);
    frameGroups.push(frames);
  }

  // 既存属性が無い場合は、未実装属性名ではなくParticle特徴JSONから1から生成する。
  if (!hasExistingAttribute) {
    frameGroups.push(await new ParticleEngine(parameter).generateFrames());
  } else if (needsDecoration(parameter, hasExistingAttribute)) {
    // 既存属性の形状を壊さないよう、装飾は少数のParticleを重ねるだけにする。
    frameGroups.push(await new ParticleEngine({
      ...parameter,
      particleCount: Math.max(8, Math.floor(parameter.particleCount / 4)),
    }, { decorationOnly: true }).generateFrames());
  }

  return combineFrameGroups(frameGroups, parameter.frameCount, parameter.imageSize);
}

//=====================================
// Sprite Sheet Utility
//=====================================

async function createSpriteSheet(frames, imageSize) {
  const width = frames.length * imageSize;
  const spriteSheet = new Jimp({
    width: width,
    height: imageSize,
    color: 0x00000000,
  });
  for (let i = 0; i < frames.length; i++) {
    spriteSheet.composite(frames[i], i * imageSize, 0);
  }
  return spriteSheet;
}

//=====================================
// GIF Utility
//=====================================

function buildDominantColorPalette(frames, preferredColors = [], maxColors = DOT_GIF_MAX_COLORS) {
  const palette = [];
  const paletteKeys = new Set();

  const pushColor = (color) => {
    if (!Array.isArray(color) || color.length !== 3) return;
    const normalized = color.map((value) => Math.max(0, Math.min(255, Math.floor(Number(value) || 0))));
    const key = normalized.join(",");
    if (!paletteKeys.has(key) && palette.length < maxColors) {
      palette.push(normalized);
      paletteKeys.add(key);
    }
  };

  for (const color of preferredColors) {
    pushColor(color);
  }

  const histogram = new Map();
  for (const frame of frames) {
    const data = frame.bitmap.data;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha < 48) continue;
      const r = Math.floor(data[i] / 16) * 16;
      const g = Math.floor(data[i + 1] / 16) * 16;
      const b = Math.floor(data[i + 2] / 16) * 16;
      const key = `${r},${g},${b}`;
      histogram.set(key, (histogram.get(key) || 0) + 1);
    }
  }

  const rankedColors = Array.from(histogram.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key.split(",").map((value) => Number(value)));

  for (const color of rankedColors) {
    if (palette.length >= maxColors) break;
    pushColor(color);
  }

  if (palette.length === 0) {
    palette.push([255, 255, 255]);
  }

  return palette;
}

function findNearestPaletteColor(r, g, b, palette) {
  let nearest = palette[0];
  let minDistance = Number.POSITIVE_INFINITY;
  for (const color of palette) {
    const dr = r - color[0];
    const dg = g - color[1];
    const db = b - color[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < minDistance) {
      nearest = color;
      minDistance = distance;
    }
  }
  return nearest;
}

function resizeFrameToDotSize(frame, targetSize = DOT_GIF_TARGET_SIZE) {
  const sourceWidth = frame.bitmap.width;
  const sourceHeight = frame.bitmap.height;
  if (sourceWidth === targetSize && sourceHeight === targetSize) {
    return frame.clone();
  }

  const sourceData = frame.bitmap.data;
  const resized = new Jimp({ width: targetSize, height: targetSize, color: 0x00000000 });
  const resizedData = resized.bitmap.data;

  for (let y = 0; y < targetSize; y++) {
    const sourceY = Math.min(sourceHeight - 1, Math.floor((y * sourceHeight) / targetSize));
    for (let x = 0; x < targetSize; x++) {
      const sourceX = Math.min(sourceWidth - 1, Math.floor((x * sourceWidth) / targetSize));
      const sourceIndex = (sourceY * sourceWidth + sourceX) * 4;
      const targetIndex = (y * targetSize + x) * 4;
      resizedData[targetIndex] = sourceData[sourceIndex];
      resizedData[targetIndex + 1] = sourceData[sourceIndex + 1];
      resizedData[targetIndex + 2] = sourceData[sourceIndex + 2];
      resizedData[targetIndex + 3] = sourceData[sourceIndex + 3];
    }
  }

  return resized;
}

function applyDotGifQuantization(frame, palette, alphaLevels = DOT_ALPHA_LEVELS) {
  const dotFrame = resizeFrameToDotSize(frame, DOT_GIF_TARGET_SIZE);
  const data = dotFrame.bitmap.data;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = quantizeAlphaLevel(data[i + 3], alphaLevels);
    if (alpha === 0) {
      data[i] = 0;
      data[i + 1] = 0;
      data[i + 2] = 0;
      data[i + 3] = 0;
      continue;
    }

    const nearestColor = findNearestPaletteColor(data[i], data[i + 1], data[i + 2], palette);
    data[i] = nearestColor[0];
    data[i + 1] = nearestColor[1];
    data[i + 2] = nearestColor[2];
    data[i + 3] = alpha;
  }

  return dotFrame;
}

async function createGIF(frames, fileName = "effect.gif", options = {}) {
  const preferredColors = normalizeColorList(options.preferredColors || [], [[255, 255, 255]]);
  const maxColors = Math.max(8, Math.min(Number(options.maxColors) || DOT_GIF_MAX_COLORS, DOT_GIF_MAX_COLORS));
  const palette = buildDominantColorPalette(frames, preferredColors, maxColors);
  const gifFrames = [];
  for (const frame of frames) {
    const quantizedFrame = applyDotGifQuantization(frame, palette, DOT_ALPHA_LEVELS);
    const gifFrame = new GifFrame(quantizedFrame.bitmap);
    //10 = 100ms
    gifFrame.delayCentisecs = 10;
    gifFrames.push(gifFrame);
  }
  const codec = new GifCodec();
  const gif = await codec.encodeGif(gifFrames, {
    loops: 0,
  });
  return new AttachmentBuilder(Buffer.from(gif.buffer), {
    name: fileName,
  });
}

const DIRECT_ATTRIBUTE_CONFIG = {
  sparkle: {
    generator: generateSparkleFrames,
    particleCount: 52,
    pngName: "sparkle.png",
    spriteName: "sparkleSprite.png",
    gifName: "sparkle.gif",
    displayName: "キラキラ",
  },
  wind: {
    generator: generateWindFrames,
    particleCount: 56,
    pngName: "wind.png",
    spriteName: "windSprite.png",
    gifName: "wind.gif",
    displayName: "風",
  },
  water: {
    generator: generateWaterFrames,
    particleCount: 54,
    pngName: "water.png",
    spriteName: "waterSprite.png",
    gifName: "water.gif",
    displayName: "水",
  },
  blast: {
    generator: generateBlastFrames,
    particleCount: 60,
    pngName: "blast.png",
    spriteName: "blastSprite.png",
    gifName: "blast.gif",
    displayName: "爆発",
  },
};

async function handleDirectAttributeCommand(message, attribute) {
  const config = DIRECT_ATTRIBUTE_CONFIG[attribute];
  if (!config) return false;

  const base = `/effect ${attribute}`;
  if (
    message.content !== base
    && message.content !== `${base} debug`
    && message.content !== `${base} sprite`
    && message.content !== `${base} gif`
  ) {
    return false;
  }

  try {
    const frames = await config.generator(config.particleCount, 8, 32);
    if (message.content === base) {
      const file = await createPNGFile(frames[0], config.pngName);
      await message.reply({
        content: `${config.displayName}エフェクトを生成しました。`,
        files: [file],
      });
      return true;
    }

    if (message.content === `${base} debug`) {
      const files = [];
      for (let i = 0; i < frames.length; i++) {
        files.push(await createPNGFile(frames[i], `${attribute}Frame${i + 1}.png`));
      }
      await message.reply({
        content: `${config.displayName}エフェクトの8Frameを生成しました。`,
        files,
      });
      return true;
    }

    if (message.content === `${base} sprite`) {
      const spriteSheet = await createSpriteSheet(frames, 32);
      const file = await createPNGFile(spriteSheet, config.spriteName);
      await message.reply({
        content: `${config.displayName}エフェクトのSpriteSheetを生成しました。`,
        files: [file],
      });
      return true;
    }

    if (message.content === `${base} gif`) {
      const file = await createGIF(frames, config.gifName);
      await message.reply({
        content: `${config.displayName} GIFを生成しました。`,
        files: [file],
      });
      return true;
    }
  } catch (error) {
    console.error(error);
    await message.reply("エフェクトの生成に失敗しました。");
    return true;
  }

  return false;
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`${readyClient.user.tag} としてログインしました`);
});

client.on("messageCreate", async (message) => {
  // Bot自身は無視
  if (message.author.bot) return;

  //=====================
  // helpコマンド
  //=====================

  if (message.content === "/help") {
    await message.reply(`
【使い方】

/help
 -> 使用方法を表示します。

/effect create ○○○
 -> Geminiがパラメータを決定し、
    PNG・SpriteSheet・GIFを生成します。

/effect fire
 -> PNGを生成します。

/effect fire debug
 -> 8Frameを確認できます。

/effect fire sprite
 -> SpriteSheetを生成します。

/effect fire gif
 -> FireのGIFを生成します。

/effect poison
 -> PNGを生成します。

/effect poison debug
 -> 8Frameを確認できます。

/effect poison sprite
 -> SpriteSheetを生成します。

 /effect poison gif
 -> PoisonのGIFを生成します。

/effect ice
 -> 氷エフェクト(PNG)を生成します。

/effect ice debug
 -> 8Frameを確認できます。

/effect ice sprite
 -> SpriteSheetを生成します。

 /effect ice gif
 -> IceのGIFを生成します。

/effect thunder
 -> 雷エフェクト(PNG)を生成します。

/effect thunder debug
 -> 8Frameを確認できます。

/effect thunder sprite
 -> SpriteSheetを生成します。

/effect thunder gif
 -> ThunderのGIFを生成します。

/effect sparkle
 -> キラキラエフェクトを生成します。

/effect sparkle debug
 -> 8Frameを確認できます。

/effect sparkle sprite
 -> SpriteSheetを生成します。

/effect sparkle gif
 -> SparkleのGIFを生成します。

/effect wind
 -> 風エフェクトを生成します。

/effect wind debug
 -> 8Frameを確認できます。

/effect wind sprite
 -> SpriteSheetを生成します。

/effect wind gif
 -> WindのGIFを生成します。

/effect water
 -> 水エフェクトを生成します。

/effect water debug
 -> 8Frameを確認できます。

/effect water sprite
 -> SpriteSheetを生成します。

/effect water gif
 -> WaterのGIFを生成します。

/effect blast
 -> 爆発エフェクトを生成します。

/effect blast debug
 -> 8Frameを確認できます。

/effect blast sprite
 -> SpriteSheetを生成します。

/effect blast gif
 -> BlastのGIFを生成します。
 
`);

    return;
  }

  //=====================
  // New Built-in Attributes
  //=====================

  if (await handleDirectAttributeCommand(message, "sparkle")) return;
  if (await handleDirectAttributeCommand(message, "wind")) return;
  if (await handleDirectAttributeCommand(message, "water")) return;
  if (await handleDirectAttributeCommand(message, "blast")) return;

  //=====================
  // fireエフェクト
  //=====================

  if (message.content === "/effect fire") {
    try {
      const frames = await generateFireFrames(70, 8, 32);
      const file = await createPNGFile(frames[0], "fire.png");
      await message.reply({
        content: "炎エフェクトを生成しました。(8Frame対応済)",
        files: [file],
      });
    } catch (error) {
      console.error(error);
      await message.reply("画像の生成に失敗しました。");
    }
  }

  //=====================
  // Fire Debug
  //=====================

  if (message.content === "/effect fire debug") {
    try {
      const frames = await generateFireFrames(70, 8, 32);
      const files = [];
      for (let i = 0; i < frames.length; i++) {
        const file = await createPNGFile(frames[i], `frame${i + 1}.png`);
        files.push(file);
      }
      await message.reply({
        content: "8Frameを生成しました。",
        files: files,
      });
    } catch (error) {
      console.error(error);
      await message.reply("Frameの生成に失敗しました。");
    }
    return;
  }

  //=====================
  // Fire Sprite Sheet
  //=====================

  if (message.content === "/effect fire sprite") {
    try {
      const frames = await generateFireFrames(70, 8, 32);
      const spriteSheet = await createSpriteSheet(frames, 32);
      const file = await createPNGFile(spriteSheet, "fireSprite.png");
      await message.reply({
        content: "SpriteSheetを生成しました。",
        files: [file],
      });
    } catch (error) {
      console.error(error);
      await message.reply("SpriteSheetの生成に失敗しました。");
    }
    return;
  }

  //=====================
  // Fire GIF
  //=====================

  if (message.content === "/effect fire gif") {
    try {
      const frames = await generateFireFrames(70, 8, 32);
      const file = await createGIF(frames, "fire.gif");
      await message.reply({
        content: "Fire GIFを生成しました。",
        files: [file],
      });
    } catch (error) {
      console.error(error);
      await message.reply("GIFの生成に失敗しました。");
    }
    return;
  }

  //=====================
  // Poison
  //=====================

  if (message.content === "/effect poison") {
    try {
      const frames = await generatePoisonFrames(40, 8, 32);
      const file = await createPNGFile(frames[0], "poison.png");
      await message.reply({
        content: "毒エフェクトを生成しました。",
        files: [file],
      });
    } catch (error) {
      console.error(error);
      await message.reply("画像の生成に失敗しました。");
    }
    return;
  }

  //=====================
  // Poison Debug
  //=====================

  if (message.content === "/effect poison debug") {
    try {
      const frames = await generatePoisonFrames(40, 8, 32);
      const files = [];
      for (let i = 0; i < frames.length; i++) {
        files.push(await createPNGFile(frames[i], `frame${i + 1}.png`));
      }
      await message.reply({
        content: "8Frameを生成しました。",
        files,
      });
    } catch (error) {
      console.error(error);
      await message.reply("Frameの生成に失敗しました。");
    }
    return;
  }

  //=====================
  // Poison Sprite Sheet
  //=====================

  if (message.content === "/effect poison sprite") {
    try {
      const frames = await generatePoisonFrames(40, 8, 32);

      const sprite = await createSpriteSheet(frames, 32);

      const file = await createPNGFile(sprite, "poisonSprite.png");

      await message.reply({
        content: "SpriteSheetを生成しました。",
        files: [file],
      });
    } catch (error) {
      console.error(error);

      await message.reply("SpriteSheetの生成に失敗しました。");
    }

    return;
  }

  //=====================
  // Poison GIF
  //=====================

  if (message.content === "/effect poison gif") {
    try {
      const frames = await generatePoisonFrames();
      const file = await createGIF(frames, "poison.gif");
      await message.reply({
        content: "Poison GIFを生成しました。",
        files: [file],
      });
    } catch (error) {
      console.error(error);
      await message.reply("GIFの生成に失敗しました。");
    }
    return;
  }

  //=====================
  // Ice Effect
  //=====================

  if (message.content === "/effect ice") {
    try {
      const frames = await generateIceFrames(40, 8, 32);
      const file = await createPNGFile(frames[0], "ice.png");
      await message.reply({
        content: "氷エフェクトを生成しました。(8Frame対応済)",
        files: [file],
      });
    } catch (error) {
      console.error(error);
      await message.reply("画像の生成に失敗しました。");
    }
    return;
  }

  //=====================
  // Ice Debug
  //=====================

  if (message.content === "/effect ice debug") {
    try {
      const frames = await generateIceFrames(40, 8, 32);
      const files = [];
      for (let i = 0; i < frames.length; i++) {
        files.push(await createPNGFile(frames[i], `iceFrame${i + 1}.png`));
      }
      await message.reply({
        content: "Iceエフェクトの8Frameを生成しました。",
        files: files,
      });
    } catch (error) {
      console.error(error);
      await message.reply("Frameの生成に失敗しました。");
    }
    return;
  }

  //=====================
  // Ice Sprite Sheet
  //=====================

  if (message.content === "/effect ice sprite") {
    try {
      const frames = await generateIceFrames(40, 8, 32);
      const spriteSheet = await createSpriteSheet(frames, 32);
      const file = await createPNGFile(spriteSheet, "iceSprite.png");
      await message.reply({
        content: "IceエフェクトのSpriteSheetを生成しました。",
        files: [file],
      });
    } catch (error) {
      console.error(error);
      await message.reply("SpriteSheetの生成に失敗しました。");
    }
    return;
  }

  //=====================
  // Ice GIF
  //=====================

  if (message.content === "/effect ice gif") {
    try {
      const frames = await generateIceFrames();
      const file = await createGIF(frames, "ice.gif");
      await message.reply({
        content: "Ice GIFを生成しました。",
        files: [file],
      });
    } catch (error) {
      console.error(error);
      await message.reply("GIFの生成に失敗しました。");
    }
    return;
  }

  //=====================
  // Thunder Effect
  //=====================

  if (message.content === "/effect thunder") {
    try {
      const frames = await generateThunderFrames(50, 8, 32);
      const file = await createPNGFile(frames[0], "thunder.png");
      await message.reply({
        content: "雷エフェクトを生成しました。(8Frame対応済)",
        files: [file],
      });
    } catch (error) {
      console.error(error);

      await message.reply("画像の生成に失敗しました。");
    }
    return;
  }

  //=====================
  // Thunder Debug
  //=====================

  if (message.content === "/effect thunder debug") {
    try {
      const frames = await generateThunderFrames();
      const files = [];
      for (let i = 0; i < frames.length; i++) {
        files.push(await createPNGFile(frames[i], `thunderFrame${i + 1}.png`));
      }
      await message.reply({
        content: "Thunderエフェクトの8Frameを生成しました。",
        files,
      });
    } catch (error) {
      console.error(error);
      await message.reply("Frameの生成に失敗しました。");
    }
    return;
  }

  //=====================
  // Thunder SpriteSheet
  //=====================

  if (message.content === "/effect thunder sprite") {
    try {
      const frames = await generateThunderFrames();
      const spriteSheet = await createSpriteSheet(frames, 32);
      const file = await createPNGFile(spriteSheet, "thunderSprite.png");
      await message.reply({
        content: "ThunderエフェクトのSpriteSheetを生成しました。",
        files: [file],
      });
    } catch (error) {
      console.error(error);
      await message.reply("SpriteSheetの生成に失敗しました。");
    }
    return;
  }

  //=====================
  // Thunder GIF
  //=====================

  if (message.content === "/effect thunder gif") {
    try {
      const frames = await generateThunderFrames();
      const file = await createGIF(frames, "thunder.gif");
      await message.reply({
        content: "Thunder GIFを生成しました。",
        files: [file],
      });
    } catch (error) {
      console.error(error);
      await message.reply("GIFの生成に失敗しました。");
    }
    return;
  }

  //=====================
  // Gemini Parameter
  //=====================

  if (message.content.startsWith("/parameter ")) {
    try {
      const prompt = message.content.replace("/parameter ", "");
      const result = await generateParameter(prompt);
      const parameter = parseParameter(result);
      await message.reply(
        `
attributes : ${parameter.attributes.join(" + ")}

styles : ${parameter.styles.join(" + ") || "none"}

movements : ${parameter.movements.join(" + ")}

colors : ${parameter.colors.map((color) => `[${color.join(", ")}]`).join(" ")}

particleCount : ${parameter.particleCount}

frameCount : ${parameter.frameCount}

imageSize : ${parameter.imageSize}
`,
      );
    } catch (error) {
      console.error(error);
      await message.reply("パラメータの生成に失敗しました。");
    }
    return;
  }

  //=====================
  // Gemini Effect Create
  //=====================

  if (message.content.startsWith("/effect create ")) {
    try {
      const prompt = message.content.replace("/effect create ", "");
      const result = await generateParameter(prompt);
      const parameter = parseParameter(result);
      const frames = await generateFramesByAttribute(parameter);
      //------------------
      // PNG
      //------------------
      const pngFile = await createPNGFile(frames[0], "effect.png");
      //------------------
      // SpriteSheet
      //------------------
      const spriteSheet = await createSpriteSheet(frames, parameter.imageSize);
      const spriteFile = await createPNGFile(spriteSheet, "effectSprite.png");
      //------------------
      // GIF
      //------------------
      const gifPreferredColors = Array.isArray(parameter.particle?.colors)
        ? parameter.particle.colors
        : parameter.colors;
      const gifFile = await createGIF(frames, "effect.gif", {
        preferredColors: gifPreferredColors,
        maxColors: 12,
      });
      await message.reply({
        content: `
attributes : ${parameter.attributes.join(" + ")}
styles : ${parameter.styles.join(" + ") || "none"}
movements : ${parameter.movements.join(" + ")}
colors : ${parameter.colors.map((color) => `[${color.join(", ")}]`).join(" ")}
particleCount : ${parameter.particleCount}
frameCount : ${parameter.frameCount}
imageSize : ${parameter.imageSize}
`,
        files: [pngFile, spriteFile, gifFile],
      });
    } catch (error) {
      console.error(error);
      await message.reply("エフェクトの生成に失敗しました。");
    }
    return;
  }
});

client.login(process.env.DISCORD_TOKEN);
