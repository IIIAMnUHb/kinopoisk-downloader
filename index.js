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
            if (typeof tasks[currentIndex] != 'function') {
                return resolve(true);
            }
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


const addZero = (number) => number.toString().length < 2 ? `0${number}` : number;

async function getParams(id) {
    const response = await fetch('https://vavada.video/iframe/'+id);
    const text = await response.text();
    const firstCut = text.split('data-cinemaplayer-query-api-ip="')[1];
    const lastCut = firstCut.split('"></div><script src="/the')[0];
    const [ ip, hash ] = lastCut.split('" data-cinemaplayer-query-api-hash="');
    return [ip,hash];
}

async function start() {
    
    const id = await makeQuestion('Введите айди на кинопоиске: ');
    console.log('Получаем айди вашей страницы...');
    const [ ip, hash ] = await getParams(id);
    console.log('Ищем плееры...');
    const moviePlayers = JSON.parse(await request('https://vavada.video/cinemaplayer/information?hash='+hash+'&ip='+ip+'&id='+id));
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
    // if (movieType != 'movie') {
    //     return console.log('Сервис можно использовать - только для полнометражных фильмов и мультфильмов')
    // }
    console.log('Начинаем поиск основных данных...');
    const movieData = JSON.parse(await request('https://api.lumex.site/content?clientId='+clientId+'&contentType='+movieType+'&contentId='+movieId, {
        headers: {
            origin: 'https://p.lumex.site',
            'sec-fetch-dest': 'empty',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
        }
    }));

    if (movieType != 'movie') {
        const mediaPlayers = movieData.player.media;
        console.log('Доступно '+mediaPlayers.length+' сезон(а).');
        let listOfEpisodes = [];
        
        for(let i = 0; i < mediaPlayers.length; i++) {
            const seasonEpisodes = mediaPlayers[i].episodes;
            const episodesToDownload = await makeQuestion([
                `Выберите серии для скачивания (${i+1} сезон).`,
                ``,
                seasonEpisodes.map((e,i) => [
                    `Серия ${i+1}.`,
                    e.media.map((x,i) => 
                        `  > ${i+1}. ${x.translation_name}`
                    ).join('\n')
                ].join('\n')).join('\n'),
                ``,
                `Выберите серии для скачивания. Дайте ответ в формате:`,
                `'серия-озвучка серия-озвучка' либо 'ALL-озвучка' или если не хотите ничего то просто '0'`,
                ``,
                `Пример №1: 1-1 2-1`,
                `Пример №2: ALL-1`,
                `Пример №3: 0`,
                ``,
                `Ввод: `
            ].join('\n'));

            const trimmedData = episodesToDownload.trim();

            if (trimmedData.startsWith('ALL')) {
                const voiceId = Number(trimmedData.replace('ALL-', ''))-1;
                for(const episode of seasonEpisodes) {
                    if(!episode.media[voiceId]) {
                        return console.log('Озвучка не неайдена для одной из серий: '+episode.name);
                    }
                    const voice = episode.media[voiceId];
                    listOfEpisodes.push({
                        playlist: voice.playlist,
                        filename: `season${addZero(i+1)}-episode${addZero(episode.episode_id)}-dub${addZero(voiceId+1)}`
                    });
                }
            } else if (trimmedData !== '0') {
                const episodesArray = trimmedData.split(' ');

                for(const episodesProto of episodesArray) {
                    const [ episodeId, voiceId ] = episodesProto.split('-');
                    const episodeIdEdited = Number(episodeId)-1;
                    const voiceIdEdited = Number(voiceId)-1;
                    if (!seasonEpisodes[episodeIdEdited]) {
                        return console.log('Один из эпизодов не найден: ' + episodesProto);
                    }
                    const episode = seasonEpisodes[episodeIdEdited];
                    if (!episode.media[voiceIdEdited]) {
                        return console.log('Одина из озвучек не найдена: ' + episodesProto);
                    }
                    const media = episode.media[voiceIdEdited];
                    listOfEpisodes.push({
                        playlist: media.playlist,
                        filename: `season${addZero(i+1)}-episode${addZero(episodeIdEdited+1)}-dub${addZero(voiceIdEdited+1)}`
                    });
                }
            }
        }
        
        let choosedType = 0;
        for(const mediaPlayer of listOfEpisodes) {

            const mediaURL = JSON.parse(await request('https://api.lumex.site' + mediaPlayer.playlist, { 
                method: 'POST', 
                headers: { 
                    origin: 'https://p.lumex.site' 
                } 
            }));
            console.log('Ссылка на медиа успешно получена. ['+mediaPlayer.filename+']');
            const m3u8Link = mediaURL.url;
            const m3u8Data = await request('https:'+m3u8Link);
            console.log('Медиа успешно получено ['+mediaPlayer.filename+']');
    
            const types = m3u8Data.split('./').map(x => x.split('\n')[0]).slice(1);
            if (types.length > 1 && !choosedType) {
                const typeID = await makeQuestion('Доступно несколько качеств для серий.\n\n'+types.map((x, i) => i+'. '+x).join('\n') + '\n\nНапишите номер нужного: ');
                const numbered = Number(typeID);
                if (numbered > types.length-1 || Number.isNaN(numbered)) {
                    return console.log('Не верно введен номер качества.')
                }
                choosedType = numbered;
            }
            console.log('Качество успешно выбрано. Начинаем загрузку ['+mediaPlayer.filename+']');
            const type = types[choosedType];
            const typeLink = m3u8Link.replace('hls.m3u8', type);
    
            const segmentsList = await request('https:'+typeLink);
            const arrayedSegments = segmentsList.split('./').map(x => x.split('\n')[0]).slice(1);
    
            console.log('Получены сегменты для загрузки. Скачиваем... ['+mediaPlayer.filename+']');
            if(!fs.readdirSync('./').includes('tmp')) fs.mkdirSync('tmp');
            if(!fs.readdirSync('./').includes('result')) fs.mkdirSync('result');
    
            const promises = [];
            const mirros = [
                "mimin",
                "promethium",
                "aura",
                "samarium",
                "storm",
                "venom",
                "aquila",
                "scorpius",
                "osiris",
                "stonehenge",
                "grendel"
            ];
            const choosedMirror = mirros[Math.floor(Math.random()*11)] || mirros[0];
    
            for(let i = 0; i < arrayedSegments.length; i++) {
                promises.push(() => new Promise(r => {
                    const segment = arrayedSegments[i];
                    const downloadLink = m3u8Link
                        .replace('hls.m3u8', segment)
                        .replace('mediaaly.pro', choosedMirror+'.mediaaly.pro');
                    try {
                        const ws = fs.createWriteStream('tmp/'+i+'.mp4');
                        https.get('https:'+downloadLink, {
                            timeout: 60000
                        }, res => {
                            res.pipe(ws);
                            console.log('Начали скачивать сегмент ['+segment+'] ('+i+') ['+mediaPlayer.filename+']');
                            res.on('end', () => { console.log('Сегмент скачан ['+segment+'] ('+i+') ['+mediaPlayer.filename+']'); return r(true); });
                        })
                    } catch {
                        const ws = fs.createWriteStream('tmp/'+i+'.mp4');
                        https.get('https:'+downloadLink, {
                            timeout: 60000
                        }, res => {
                            res.pipe(ws);
                            console.log('Начали скачивать сегмент ['+segment+'] ('+i+') ['+mediaPlayer.filename+']');
                            res.on('end', () => { console.log('Сегмент скачан ['+segment+'] ('+i+') ['+mediaPlayer.filename+']'); return r(true); });
                        })
                    }
                }))
            }
    
            try { 
                await promisePool(promises, 10); 
                await mergeFiles('./result/'+mediaPlayer.filename+'.mp4');
                await new Promise(r => fs.rm('tmp', { recursive: true, force: true }, () => { console.log('Завершено скачивание серии. ['+mediaPlayer.filename+']'); r(); }));
            } catch {};
        }

    } else {
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
        console.log('Озвучка успешно выбрана. Начинаем подготовку медиа');
        const mediaPlayer = mediaPlayers[choosedMediaPlayer];

        const mediaURL = JSON.parse(await request('https://api.lumex.site' + mediaPlayer.playlist, { 
            method: 'POST', 
            headers: { 
                origin: 'https://p.lumex.site' 
            } 
        }));
        console.log('Ссылка на медиа успешно получена.');
        const m3u8Link = mediaURL.url;
        const m3u8Data = await request('https:'+m3u8Link);
        console.log('Медиа успешно получено');

        const types = m3u8Data.split('./').map(x => x.split('\n')[0]).slice(1);
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
        const arrayedSegments = segmentsList.split('./').map(x => x.split('\n')[0]).slice(1);

        console.log('Получены сегменты для загрузки. Скачиваем...');
        if(!fs.readdirSync('./').includes('tmp')) fs.mkdirSync('tmp');

        const promises = [];
        const mirros = [
            "mimin",
            "promethium",
            "aura",
            "samarium",
            "storm",
            "venom",
            "aquila",
            "scorpius",
            "osiris",
            "stonehenge",
            "grendel"
        ];
        const choosedMirror = mirros[Math.floor(Math.random()*11)] || mirros[0];

        for(let i = 0; i < arrayedSegments.length; i++) {
            promises.push(() => new Promise(r => {
                const segment = arrayedSegments[i];
                const downloadLink = m3u8Link
                    .replace('hls.m3u8', segment)
                    .replace('mediaaly.pro', choosedMirror+'.mediaaly.pro');
                try {
                    const ws = fs.createWriteStream('tmp/'+i+'.mp4');
                    https.get('https:'+downloadLink, {
                        timeout: 60000
                    }, res => {
                        res.pipe(ws);
                        console.log('Начали скачивать сегмент ['+segment+'] ('+i+')');
                        res.on('end', () => { console.log('Сегмент скачан ['+segment+'] ('+i+')'); return r(true); });
                    })
                } catch {
                    const ws = fs.createWriteStream('tmp/'+i+'.mp4');
                    https.get('https:'+downloadLink, {
                        timeout: 60000
                    }, res => {
                        res.pipe(ws);
                        console.log('Начали скачивать сегмент ['+segment+'] ('+i+')');
                        res.on('end', () => { console.log('Сегмент скачан ['+segment+'] ('+i+')'); return r(true); });
                    })
                }
            }))
        }

        try { 
            await promisePool(promises, 10); 
            await mergeFiles('movie.mp4');
            fs.rm('tmp', { recursive: true, force: true }, () => { console.log('Завершено.') });
        } catch {};
    }
}
start();