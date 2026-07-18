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
attributeは、
・fire
・poison
・ice
・thunder
のいずれかのみ許可します。
particleCountは、
20～300

frameCountは、
8～32

imageSizeは、
32または64のみ許可します。
必ずJSONのみを返してください。
{
"attribute":"",
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

  return JSON.parse(jsonText);
}

async function generateFramesByAttribute(parameter) {
  switch (parameter.attribute) {
    case "fire":
      return await generateFireFrames(
        parameter.particleCount,
        parameter.frameCount,
        parameter.imageSize,
      );
    case "poison":
      return await generatePoisonFrames(
        parameter.particleCount,
        parameter.frameCount,
        parameter.imageSize,
      );
    case "ice":
      return await generateIceFrames(
        parameter.particleCount,
        parameter.frameCount,
        parameter.imageSize,
      );
    case "thunder":
      return await generateThunderFrames(
        parameter.particleCount,
        parameter.frameCount,
        parameter.imageSize,
      );
    default:
      throw new Error("対応していないattributeです。");
  }
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

async function createGIF(frames, fileName = "effect.gif") {
  const gifFrames = [];
  for (const frame of frames) {
    const gifFrame = new GifFrame(frame.bitmap);
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
 
`);

    return;
  }

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
attribute : ${parameter.attribute}

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
      const gifFile = await createGIF(frames, "effect.gif");
      await message.reply({
        content: `
attribute : ${parameter.attribute}
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
