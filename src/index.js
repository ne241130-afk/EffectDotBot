import {
  Client,
  Events,
  GatewayIntentBits,
  AttachmentBuilder,
} from "discord.js";
import dotenv from "dotenv";
import { Jimp, rgbaToInt } from "jimp";

dotenv.config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});


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

/effect fire
  -> 32×32の炎エフェクトを生成します。
`);

    return;
  }


  //=====================
  // fireエフェクト
  //=====================

  if (message.content === "/effect fire") {

    try {

      // 透明な32×32画像を生成
      const image = new Jimp({
        width: 32,
        height: 32,
        color: 0x00000000,
      });


      //------------------
      // 炎っぽい粒子を描画
      //------------------

      for (let y = 0; y < 32; y++) {

        for (let x = 0; x < 32; x++) {

          // 下側ほど描画されやすくする
          const probability = y / 32;

          if (Math.random() < probability * 0.6) {

            const color = rgbaToInt(
              255,
              Math.floor(Math.random() * 180),
              0,
              255
            );

            image.setPixelColor(color, x, y);
          }
        }
      }


      // pngへ変換
      const buffer = await image.getBuffer("image/png");


      const file = new AttachmentBuilder(
        buffer,
        {
          name: "fire.png",
        }
      );


      await message.reply({
        content: "炎エフェクトを生成しました。",
        files: [file],
      });

    } catch (error) {

      console.error(error);

      await message.reply(
        "画像の生成に失敗しました。"
      );
    }
  }

});


client.login(process.env.DISCORD_TOKEN);