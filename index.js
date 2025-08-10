const ffmpeg = require('fluent-ffmpeg');
const readline = require('readline');
const fs = require('fs');
const https = require('https');
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

if (!fs.readdirSync('./').includes('скачано')) {
    fs.mkdirSync('./скачано')
    console.log('Папка \'скачано\' не найдена. Создали');
};

if (!fs.readdirSync('./').includes('ffmpeg.exe')) {
    console.log('Ffmpeg не найден. Скачиваем с сервера');
    const ffmpegUrl = 'https://inotdev.ru/movie/ffmpeg.exe';
    const file = fs.createWriteStream('./ffmpeg.exe');

    https.get(ffmpegUrl, (response) => {
        if (response.statusCode !== 200) {
            console.log('Не удалось скачать ffmpeg.exe. Код ответа:', response.statusCode);
            return;
        }
        let totalBytes = parseInt(response.headers['content-length'], 10);
        let downloadedBytes = 0;
        let lastPercent = 0;

        response.on('data', (chunk) => {
            downloadedBytes += chunk.length;
            if (totalBytes) {
                let percent = Math.floor((downloadedBytes / totalBytes) * 100);
                if (percent > lastPercent) {
                    for (let p = lastPercent + 1; p <= percent; p++) {
                        process.stdout.write(`\rСкачивание ffmpeg.exe: ${p}%`);
                    }
                    lastPercent = percent;
                }
            }
        });

        response.on('end', () => {
            if (totalBytes) {
                process.stdout.write('\rСкачивание ffmpeg.exe: 100%\n');
            }
        });
        response.pipe(file);
        file.on('finish', () => {
            file.close(() => {
                console.log('ffmpeg.exe успешно скачан!');
                ffmpeg.setFfmpegPath('./ffmpeg.exe');
            });
        });
    }).on('error', (err) => {
        fs.unlink(ffmpegPath, () => {});
        console.log('Ошибка при скачивании ffmpeg.exe:', err.message);
        start()
    });
} else start()

function start() {
    rl.question('Введите код полученный с сайта (https://inotdev.ru/movie): ', (data) => {
        console.log('Ищем фильм...')
        try {
            const decoded = Buffer.from(data, 'base64').toString('utf8');
            const [ quality, url, ref, name ] = JSON.parse(decoded);
            const forbiddenChars = /[<>:"/\\|?*]/g;
            const safeName = name.replace(forbiddenChars, '');
            console.log('Получили данные фильма',safeName,`(${quality}p)`);
            download(url,ref,safeName)
        } catch {
            console.log('Не верный код. Попробуйте еще раз')
        }
    })
    
    function download(url, ref, name) {
        ffmpeg()
            .input(url)
            .inputOptions([
                '-headers', [
                    'Referer: '+ref,
                    'Origin: https://thesaurus.stloadi.live'
                ].join('\r\n')
            ])
            .outputOptions([
                '-c copy',           
                '-bsf:a aac_adtstoasc' 
            ])
            .on('start', () => {
                console.log('Начинаем загрузку фильма...');
            })
            .on('progress', progress => {
                console.log(`Прогресс загрузки: ${progress.timemark}`);
            })
            .on('error', (err, stdout, stderr) => {
                console.error('Ошибка ffmpeg:', err.message);
                console.error('stdout:', stdout);
                console.error('stderr:', stderr);
            })
            .on('end', () => {
                console.log('Скачивание и сборка завершены! Фильм доступен в папке: /скачано/');
                start()
            })
            .save('скачано/'+name+'.mp4');    
    }
}

