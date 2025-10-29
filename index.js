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

// if (!fs.readdirSync('./').includes('ffmpeg.exe')) {
//     console.log('Ffmpeg не найден. Скачиваем с сервера');
//     const ffmpegUrl = 'https://inot.dev/movie/ffmpeg.exe';
//     const file = fs.createWriteStream('./ffmpeg.exe');

//     https.get(ffmpegUrl, (response) => {
//         if (response.statusCode !== 200) {
//             console.log('Не удалось скачать ffmpeg.exe. Код ответа:', response.statusCode);
//             return;
//         }
//         let totalBytes = parseInt(response.headers['content-length'], 10);
//         let downloadedBytes = 0;
//         let lastPercent = 0;

//         response.on('data', (chunk) => {
//             downloadedBytes += chunk.length;
//             if (totalBytes) {
//                 let percent = Math.floor((downloadedBytes / totalBytes) * 100);
//                 if (percent > lastPercent) {
//                     for (let p = lastPercent + 1; p <= percent; p++) {
//                         process.stdout.write(`\rСкачивание ffmpeg.exe: ${p}%`);
//                     }
//                     lastPercent = percent;
//                 }
//             }
//         });

//         response.on('end', () => {
//             if (totalBytes) {
//                 process.stdout.write('\rСкачивание ffmpeg.exe: 100%\n');
//             }
//         });
//         response.pipe(file);
//         file.on('finish', () => {
//             file.close(() => {
//                 console.log('ffmpeg.exe успешно скачан!');
//                 ffmpeg.setFfmpegPath('./ffmpeg.exe');
//             });
//         });
//     }).on('error', (err) => {
//         fs.unlink(ffmpegPath, () => {});
//         console.log('Ошибка при скачивании ffmpeg.exe:', err.message);
//         start()
//     });
// } else 
start()

async function getMedia(url) {
    const response = await fetch(url);
    return response.url.split(':hls:')[0]
}

function start() {
    rl.question('Введите код полученный с сайта (https://inot.dev/movie): ', async (data) => {
        console.log('Ищем фильм...')
        try {
            const decoded = Buffer.from(data, 'base64').toString('utf8');
            const [ quality, video, name ] = JSON.parse(decoded);
            const forbiddenChars = /[<>:"/\\|?*]/g;
            const safeName = name.replace(forbiddenChars, '');
            console.log('Получили данные фильма',safeName,`(${quality})`);
            const url = await getMedia(video);
            console.log('Получили url стрима', url);
            download(url,safeName);
        } catch(err) {
            console.log(err)
            console.log('Не верный код. Попробуйте еще раз')
        }
    })
    
    function download(url, name) {
        https.get(url, (res) => {
            console.log('Ответ от сервера:', res.statusCode)
            const filePath = `./скачано/${name}.mp4`;
            const file = fs.createWriteStream(filePath);

            let totalBytes = parseInt(res.headers['content-length'], 10);
            let downloadedBytes = 0;

            console.log(`Начинаем скачивание: ${name}`);

            res.on('data', (chunk) => {
                downloadedBytes += chunk.length;
                if (totalBytes) {
                    const percent = Math.floor((downloadedBytes / totalBytes) * 100);
                    // if (percent !== lastPercent) {
                        process.stdout.write(`\rСкачивание ${name}: ${percent}% (${Math.floor(downloadedBytes / (1024 * 1024))} MB)`);
                    // }
                } else {
                    process.stdout.write(`\rСкачивание ${name}: ${Math.floor(downloadedBytes / (1024 * 1024))} MB`);
                }
            });

            res.on('end', () => {
                if (totalBytes) {
                    process.stdout.write(`\rСкачивание ${name}: 100%\n`);
                } else {
                    process.stdout.write('\n');
                }
            });

            res.on('error', (err) => {
                console.error(`\nОшибка при скачивании ${name}:`, err.message);
                file.destroy();
                fs.unlink(filePath, () => {});
            });

            res.pipe(file);

            file.on('error', (err) => {
                console.error(`\nОшибка при записи файла ${name}:`, err.message);
                fs.unlink(filePath, () => {});
            });

            file.on('finish', () => {
                file.close(() => {
                    console.log(`${name} успешно скачан в ${filePath}!`);
                });
            });
        })   
    }
}

