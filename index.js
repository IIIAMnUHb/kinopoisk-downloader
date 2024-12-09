const rl = require('readline');
const { https } = require('follow-redirects');
const fs = require('fs')

function makeQuestion(q) {
    return new Promise(r => {
        const input = rl.createInterface({
            input: process.stdin,
            output: process.stdout
        })

        input.question(q, (answer) => { input.close(); return r(answer); })
    })
}

async function request(url, options) {
    const response = await fetch(url, options);
    return await response.text();
}

function promisePool(tasks, concurrency) {
    let currentIndex = 0; // Текущий индекс в массиве задач

    return new Promise((resolve, reject) => {
        function next() {
            tasks[currentIndex]().then(e => {
                next();
            })
            currentIndex++;
            if (currentIndex >= tasks.length) {
                resolve(true);
            }
        }
        for(let i = 0; i < concurrency; i++) {
            tasks[currentIndex]().then(e => {
                next();
                // console.log('Started');
            })
            currentIndex++;
        }
    });
}

function mergeFiles(output) {
    const files = fs.readdirSync('tmp')
        .sort((a,b) => Number(a.replace('.mp4', '')) - Number(b.replace('.mp4', '')))
        .map(x => 'tmp/'+x);
    const writeStream = fs.createWriteStream(output);
  
    return new Promise((resolve, reject) => {
      function appendFile(index) {
        if (index >= files.length) {
          writeStream.end();
          resolve(output);
          return;
        }
  
        const readStream = fs.createReadStream(files[index]);
        readStream.pipe(writeStream, { end: false });
  
        readStream.on('end', () => appendFile(index + 1));
        readStream.on('error', reject);
      }
  
      appendFile(0);
    });
  }

async function start() {
    
    const id = await makeQuestion('Введите айди на кинопоиске: ');

    console.log('Ищем плееры...');
    const moviePlayers = JSON.parse(await request('https://vavada.video/cinemaplayer/information?hash=bbbd96b5d1a652a09bd4fea2fd56c2b3&ip=172.18.0.3&id='+id));
    if (!moviePlayers['simple-api']) {
        return console.log('Ничего не найдено.');
    }
    const players = moviePlayers['simple-api'];
    console.log('Найдено - ' + players.length + ' плеер(а)');
    console.log('Начинаем обработку...');
    const lumex = players.filter(e => e.iframe.includes('lumex'));
    console.log('Отобрано - ' + lumex.length + ' подходящих плеер(ов).')
    if (lumex.length == 0) {
        return console.log('Нет подходящих плееров.');
    }
    const player = lumex[0];
    const [ clientId, movieType, movieId ] = player.iframe.split('/').slice(-3);
    if (movieType != 'movie') {
        return console.log('Сервис можно использовать - только для полнометражных фильмов и мультфильмов')
    }
    console.log('Начинаем поиск основных данных...');
    const movieData = JSON.parse(await request('https://api.lumex.pw/content?clientId='+clientId+'&contentType=movie&contentId='+movieId, {
        headers: {
            origin: 'https://p.lumex.pw',
            'sec-fetch-dest': 'empty',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        }
    }));

    const mediaPlayers = movieData.player.media;
    let choosedMediaPlayer = 0;
    if (mediaPlayers.length > 1) {
        const voiceID = await makeQuestion('Доступно несколько озвучек для данного фильма.\n\n'+mediaPlayers.map((x, i) => i+'. '+x.translation_name).join('\n') + '\n\nНапишите номер нужной озвучки: ');
        const numbered = Number(voiceID);
        if (numbered > mediaPlayers.length-1 || Number.isNaN(numbered)) {
            return console.log('Не верно введен номер озвучки.')
        }
        choosedMediaPlayer = numbered;
    }
    console.log('Озвучка успешно выбрана. Начинаем подготовку медиа')
    const mediaPlayer = mediaPlayers[choosedMediaPlayer];

    const mediaURL = JSON.parse(await request('https://api.lumex.pw' + mediaPlayer.playlist, { 
        method: 'POST', 
        headers: { 
            origin: 'https://p.lumex.pw' 
        } 
    }));
    console.log('Ссылка на медиа успешно получена.');
    const m3u8Link = mediaURL.url;
    const m3u8Data = await request('https:'+m3u8Link);
    console.log('Медиа успешно получено');

    const types = m3u8Data.split('./').map(x => x.split('\n')[0]).slice(1, -1);
    let choosedType = 0;
    if (types.length > 1) {
        const typeID = await makeQuestion('Доступно несколько качеств для фильма.\n\n'+types.map((x, i) => i+'. '+x).join('\n') + '\n\nНапишите номер нужного: ');
        const numbered = Number(typeID);
        if (numbered > types.length-1 || Number.isNaN(numbered)) {
            return console.log('Не верно введен номер качества.')
        }
        choosedType = numbered;
    }
    console.log('Качество успешно выбрано. Начинаем загрузку');
    const type = types[choosedType];
    const typeLink = m3u8Link.replace('hls.m3u8', type);

    const segmentsList = await request('https:'+typeLink);
    const arrayedSegments = segmentsList.split('./').map(x => x.split('\n')[0]).slice(1, -1);

    console.log('Получены сегменты для загрузки. Скачиваем...');
    if(!fs.readdirSync('./').includes('tmp')) fs.mkdirSync('tmp');

    const promises = [];

    for(let i = 0; i < arrayedSegments.length; i++) {
        promises.push(() => new Promise(r => {
            const segment = arrayedSegments[i];
            const downloadLink = m3u8Link.replace('hls.m3u8', segment);
            const ws = fs.createWriteStream('tmp/'+i+'.mp4');
            https.get('https:'+downloadLink, res => {
                res.pipe(ws);
                console.log('Начали скачивать сегмент ['+segment+'] ('+i+')');
                res.on('end', () => { console.log('Сегмент скачан ['+segment+'] ('+i+')'); return r(true); });
            })
        }))
    }

    await promisePool(promises, 10);
    await mergeFiles('movie.mp4');
    fs.rmdirSync('tmp')
}
start();