const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenAI } = require('@google/genai');

const token = '8646484566:AAGHZmdFp8xfk3_ypkio_OSbvf-y0P6ZGTk';
const bot = new TelegramBot(token, { polling: true });

const ai = new GoogleGenAI({ apiKey: 'AQ.Ab8RN6IaSazsupRz72KZekNx6IeBniZCbTFrCmyhzKDXRGW5bA' });

// Penyimpanan data pengguna sementara di memori (bisa dipindah ke database nanti)
// Format: { chatId: { targetKalori: 2000, riwayat: [{nama, kalori, gula, waktu}] } }
const userData = {};

console.log("Bot Kalori Tracker Lengkap aktif 24 jam!");

// Perintah /start
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
        "Halo! Selamat datang di Bot Kalori & Nutrisi. 🍏\n\n" +
        "Perintah yang tersedia:\n" +
        "1. Kirim **foto makanan/minuman** untuk dihitung kalori dan kadar gulanya.\n" +
        "2. Ketik `/target [angka]` untuk set batas kalori harian kamu (Contoh: `/target 1800`).\n" +
        "3. Ketik `/rekap` untuk melihat total makanan dan kalori yang masuk hari ini.\n" +
        "4. Ketik `/reset` untuk menghapus data rekap hari ini."
    );
});

// Mengatur Target Kalori Harian
bot.onText(/\/target (.+)/, (msg, match) => {
    const chatId = msg.chat.id;
    const target = parseInt(match[1]);

    if (isNaN(target) || target <= 0) {
        bot.sendMessage(chatId, "Format salah! Gunakan angka, contoh: `/target 2000`", { parse_mode: 'Markdown' });
        return;
    }

    if (!userData[chatId]) {
        userData[chatId] = { targetKalori: 2000, riwayat: [] };
    }

    userData[chatId].targetKalori = target;
    bot.sendMessage(chatId, `✅ Target kalori harian kamu berhasil diatur ke **${target} kkal**.`);
});

// Melihat Rekap Harian & Saran Target
bot.onText(/\/rekap/, (msg) => {
    const chatId = msg.chat.id;
    const user = userData[chatId];

    if (!user || user.riwayat.length === 0) {
        bot.sendMessage(chatId, "Belum ada makanan yang dicatat hari ini. Kirim foto makananmu yuk!");
        return;
    }

    let totalKalori = 0;
    let totalGula = 0;
    let daftarMakanan = "";

    user.riwayat.forEach((item, index) => {
        totalKalori += item.kalori;
        totalGula += item.gula;
        daftarMakanan += `${index + 1}. ${item.nama} - *${item.kalori} kkal* (Gula: ${item.gula}g)\n`;
    });

    const target = user.targetKalori || 2000;
    const sisaKalori = target - totalKalori;

    let pesanStatus = "";
    if (sisaKalori >= 0) {
        pesanStatus = `🟢 Sisa kuota kalori kamu hari ini: **${sisaKalori} kkal lagi** dari target ${target} kkal. Semangat pertahankan! 💪`;
    } else {
        pesanStatus = `🔴 **Peringatan!** Kalori kamu sudah **melebihi batas** sebanyak **${Math.abs(sisaKalori)} kkal** dari target ${target} kkal! Kurangi porsi makan berikutnya ya. ⚠️`;
    }

    const rekapPesan = 
        `📊 *REKAP KONSUMSI HARIAN*\n\n` +
        `Daftar Makanan:\n${daftarMakanan}\n` +
        `-----------------------------------\n` +
        `🔥 **Total Kalori:** ${totalKalori} kkal\n` +
        `🍬 **Total Gula:** ${totalGula} gram\n` +
        `🎯 **Target Harian:** ${target} kkal\n\n` +
        pesanStatus;

    bot.sendMessage(chatId, rekapPesan, { parse_mode: 'Markdown' });
});

// Mereset Rekap Harian
bot.onText(/\/reset/, (msg) => {
    const chatId = msg.chat.id;
    if (userData[chatId]) {
        userData[chatId].riwayat = [];
    }
    bot.sendMessage(chatId, "🔄 Rekap harian berhasil direset kembali menjadi 0!");
});

// Fitur Scan Foto & Analisis Teks (Chat)
bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;

    if (!userData[chatId]) {
        userData[chatId] = { targetKalori: 2000, riwayat: [] };
    }

    bot.sendMessage(chatId, "Sedang menganalisis foto makanan & kandungan nutrisinya... 🧐📸");

    try {
        const photo = msg.photo[msg.photo.length - 1];
        const fileLink = await bot.getFileLink(photo.file_id);
        
        const response = await fetch(fileLink);
        const buffer = await response.arrayBuffer();
        const base64Image = Buffer.from(buffer).toString("base64");

        const promptText = 
            "Analisis foto makanan/minuman ini secara akurat. " +
            "Berikan informasi dengan format teks persis seperti ini:\n" +
            "Nama: [Nama Makanan/Minuman]\n" +
            "Kalori: [Hanya angka total kalori dalam satuan kkal, contoh: 350]\n" +
            "Gula: [Hanya angka perkiraan kadar gula dalam gram, contoh: 12]\n" +
            "Jika foto tersebut BUKAN makanan atau minuman, tulis persis: Bukan makanan.";

        const aiResponse = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: [
                {
                    inlineData: {
                        data: base64Image,
                        mimeType: "image/jpeg"
                    }
                },
                { text: promptText }
            ]
        });

        const hasilText = aiResponse.text.trim();

        if (hasilText.toLowerCase().includes("bukan makanan")) {
            bot.sendMessage(chatId, "❌ Foto yang kamu kirim sepertinya bukan makanan atau minuman. Coba kirim foto makanan ya!");
            return;
        }

        // Parsing hasil dari AI menggunakan Regular Expression (Regex)
        const matchNama = hasilText.match(/Nama:\s*(.+)/i);
        const matchKalori = hasilText.match(/Kalori:\s*(\d+)/i);
        const matchGula = hasilText.match(/Gula:\s*(\d+)/i);

        const namaMakanan = matchNama ? matchNama[1].trim() : "Makanan Tidak Dikenal";
        const jumlahKalori = matchKalori ? parseInt(matchKalori[1]) : 0;
        const jumlahGula = matchGula ? parseInt(matchGula[1]) : 0;

        // Masukkan ke dalam riwayat pengguna
        userData[chatId].riwayat.push({
            nama: namaMakanan,
            kalori: jumlahKalori,
            gula: jumlahGula
        });

        // Hitung total kalori saat ini vs target
        let totalKaloriSekarang = 0;
        userData[chatId].riwayat.forEach(item => totalKaloriSekarang += item.kalori);
        const target = userData[chatId].targetKalori;
        const sisa = target - totalKaloriSekarang;

        let statusPeringatan = "";
        if (sisa < 0) {
            statusPeringatan = `\n\n⚠️ *Peringatan:* Target kalori harian kamu sudah melebihi batas sebanyak ${Math.abs(sisa)} kkal!`;
        } else {
            statusPeringatan = `\n\n💡 Sisa kuota kalori hari ini: ${sisa} kkal lagi.`;
        }

        const balasan = 
            `✨ *Hasil Analisis Makanan*\n\n` +
            `🍽️ **Menu:** ${namaMakanan}\n` +
            `🔥 **Kalori:** ${jumlahKalori} kkal\n` +
            `🍬 **Kadar Gula:** ${jumlahGula} gram` +
            statusPeringatan;

        bot.sendMessage(chatId, balasan, { parse_mode: 'Markdown' });

    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, `Gagal memproses foto: ${error.message}`);
    }
});
