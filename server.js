const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenAI } = require('@google/genai');

// Ganti dengan TOKEN bot Telegram baru kamu dari BotFather
const token = '8674330073:AAEu7tplg7JCfty_iLey__ZwSV3VOvQZ0rU';
const bot = new TelegramBot(token, { polling: true });

// Inisialisasi Gemini API (Masukkan API Key Google AI Studio kamu)
const ai = new GoogleGenAI({ apiKey: 'AQ.Ab8RN6KTI9dqWwv7x1x0i4X5l24ebRk1mfocBLK_NlVaDNYX6Q' });

// Penyimpanan data kalori harian sementara untuk pengguna (berdasarkan ID Telegram)
// Format: { userId: { tanggal: 'YYYY-MM-DD', totalKalori: 0, riwayat: [] } }
const userLogs = {};

console.log("Bot Kalori Tracker aktif 24 jam!");

// Pesan saat /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Halo! Kirim foto makanan atau minuman kamu ke sini, nanti aku hitung kalorinya dan catat total harian kamu!\n\nKetik /rekap untuk melihat total kalori hari ini.");
});

// Fitur melihat rekap harian & makanan yang sudah dimakan
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

// Fitur pembaca foto makanan & pencatat kalori otomatis
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

        // Kirim ke Gemini untuk dianalisis nama makanan & kalorinya
        const aiResponse = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: [
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: "image/jpeg"
                    }
                },
                {
                    text: "Analisis foto ini. Apakah ini makanan/minuman? Jika ya, berikan nama makanannya dan estimasi jumlah kalorinya (dalam angka saja untuk kalorinya). Jawab dengan format persis seperti ini:\nNama: [Nama Makanan]\nKalori: [Angka Kalori] kkal\nJika bukan makanan, tulis: Bukan makanan."
                }
            ]
        });

        const hasilText = aiResponse.text;

        if (hasilText.includes("Bukan makanan")) {
            bot.sendMessage(chatId, "Duh, itu sepertinya bukan foto makanan. Coba kirim foto makanan atau minuman ya! 🍼");
            return;
        }

        // Parsing sederhana nama dan kalori dari AI
        bot.sendMessage(chatId, `✨ *Hasil Analisis Gemini:*\n\n${hasilText}`, { parse_mode: 'Markdown' });

        // Ekstraksi angka kalori untuk dimasukkan ke rekap harian
        const kaloriMatch = hasilText.match(/Kalori:\s*(\d+)/i);
        const namaMatch = hasilText.match(/Nama:\s*(.+)/i);

        if (kaloriMatch && namaMatch) {
            const namaMakanan = namaMatch[1].trim();
            const jumlahKalori = parseInt(kaloriMatch[1]);
            const today = new Date().toISOString().split('T')[0];

            // Inisialisasi data harian jika belum ada atau sudah berganti hari
            if (!userLogs[userId] || userLogs[userId].tanggal !== today) {
                userLogs[userId] = {
                    tanggal: today,
                    totalKalori: 0,
                    riwayat: []
                };
            }

            // Tambahkan ke riwayat harian
            userLogs[userId].totalKalori += jumlahKalori;
            userLogs[userId].riwayat.push({ nama: namaMakanan, kalori: jumlahKalori });

            bot.sendMessage(chatId, `✅ Berhasil dicatat ke rekap hari ini!\n🔥 Total sementara: *${userLogs[userId].totalKalori} kkal*\n\nKetik /rekap untuk melihat daftar makananmu.`, { parse_mode: 'Markdown' });
        }

    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, "Duh, maap ya fotonya gagal dibaca oleh server. Coba kirim ulang foto yang lebih jelas ya! 🍼");
    }
});