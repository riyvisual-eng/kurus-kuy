const TelegramBot = require('node-telegram-bot-api');

// 1. Masukkan Token Telegram kamu di sini
const token = '8646484566:AAGHZmdFp8xfk3_ypkio_OSbvf-y0P6ZGTk';
const bot = new TelegramBot(token, { polling: true });

// 2. Masukkan API Key Gemini kamu di sini (Langsung nembak server Google, dijamin anti error 401)
// Ganti bagian const GEMINI_API_KEY dengan baris ini:
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 'AQ.Ab8RN6IQB2cTubx2B6dPN3lqwUPgfTTOVwn8QNv48wdTcyqfjw';

const userLogs = {};

console.log("Bot Kalori Tracker aktif 24 jam!");

bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Halo! Kirim foto makanan atau minuman kamu ke sini, nanti aku hitung kalorinya dan catat total harian kamu!\n\nKetik /rekap untuk melihat total kalori hari ini.");
});

bot.onText(/\/rekap/, (msg) => {
    const userId = msg.from.id;
    const today = new Date().toISOString().split('T')[0];

    if (!userLogs[userId] || userLogs[userId].tanggal !== today || userLogs[userId].riwayat.length === 0) {
        bot.sendMessage(msg.chat.id, "Belum ada makanan yang dicatat hari ini, yuk kirim foto makananmu! 🍽️");
        return;
    }

    const data = userLogs[userId];
    let pesan = `📊 *Rekap Kalori Hari Ini*\n\n`;
    data.riwayat.forEach((item, index) => {
        pesan += `${index + 1}. ${item.nama} - *${item.kalori} kkal*\n`;
    });
    pesan += `\n🔥 **Total Kalori:** *${data.totalKalori} kkal*`;

    bot.sendMessage(msg.chat.id, pesan, { parse_mode: 'Markdown' });
});

bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    bot.sendMessage(chatId, "Sebentar ya, lagi di-scan makanannya dan dihitung kalorinya... 🧐🔍");

    try {
        const photo = msg.photo[msg.photo.length - 1];
        const fileLink = await bot.getFileLink(photo.file_id);
        
        const response = await fetch(fileLink);
        const buffer = await response.arrayBuffer();
        const base64Image = Buffer.from(buffer).toString("base64");

        // Request langsung ke API Google Gemini pakai fetch (Anti Error 401)
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const aiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            inlineData: {
                                mimeType: "image/jpeg",
                                data: base64Image
                            }
                        },
                        {
                            text: "Analisis foto ini. Apakah ini makanan/minuman? Jika ya, berikan nama makanannya dan estimasi jumlah kalorinya (dalam angka saja untuk kalorinya). Jawab dengan format persis seperti ini:\nNama: [Nama Makanan]\nKalori: [Angka Kalori] kkal\nJika bukan makanan, tulis: Bukan makanan."
                        }
                    ]
                }]
            })
        });

        const aiData = await aiRes.json();
        
        if (aiData.error) {
            throw new Error(aiData.error.message);
        }

        const hasilText = aiData.candidates[0].content.parts[0].text;

        if (hasilText.includes("Bukan makanan")) {
            bot.sendMessage(chatId, "Duh, itu sepertinya bukan foto makanan. Coba kirim foto makanan atau minuman ya! 🍼");
            return;
        }

        bot.sendMessage(chatId, `✨ *Hasil Analisis Gemini:*\n\n${hasilText}`, { parse_mode: 'Markdown' });

        const kaloriMatch = hasilText.match(/Kalori:\s*(\d+)/i);
        const namaMatch = hasilText.match(/Nama:\s*(.+)/i);

        if (kaloriMatch && namaMatch) {
            const namaMakanan = namaMatch[1].trim();
            const jumlahKalori = parseInt(kaloriMatch[1]);
            const today = new Date().toISOString().split('T')[0];

            if (!userLogs[userId] || userLogs[userId].tanggal !== today) {
                userLogs[userId] = {
                    tanggal: today,
                    totalKalori: 0,
                    riwayat: []
                };
            }

            userLogs[userId].totalKalori += jumlahKalori;
            userLogs[userId].riwayat.push({ nama: namaMakanan, kalori: jumlahKalori });

            bot.sendMessage(chatId, `✅ Berhasil dicatat ke rekap hari ini!\n🔥 Total sementara: *${userLogs[userId].totalKalori} kkal*\n\nKetik /rekap untuk melihat daftar makananmu.`, { parse_mode: 'Markdown' });
        }

    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, `Duh, maap ya terjadi kendala: ${error.message}`);
    }
});
