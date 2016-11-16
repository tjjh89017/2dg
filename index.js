#!/usr/bin/env node
const Crawler = require("crawler")
const fs = require("fs")
const vm = require('vm')
const request = require('request')
const unpack = require('unpacker').unpack
const progress = require('request-progress')
const ProgressBar = require('node-progress-bars')
const stringWidth = require('string-width')

function right_pad(str, len, padding_chr) {
    padding_chr = padding_chr || ' '
    var curr_size = stringWidth(str)
    var padding_len = len - curr_size
    if (padding_len <= 0) {
        return str
    }
    return str + new Array(padding_len + 1).join(padding_chr)
}

var video_callback = function(dir, anime_name, episode_number){
    return function(error, result, $){
        if (debug_mode) {
            logger.write('result: ' + result + '\n')
            logger.write('dir: ' + dir + '\n')
            logger.write('name: ' + name + '\n')
        }

        // parse js code
        //var code = /eval\((.*)\);/.exec($("script").last().text())[1]
        var code = $("script").last().text()
        if (debug_mode) {
            logger.write('code: ' + code + '\n')
        }
        code = unpack(code)
        code = code.replace(/player\.on(.|[\n\r])*/, '')
        code = code.replace(/var player=jwplayer\('videoContainer'\);/, '')
        code = code.replace(/player.setup\(playerSetup\)/, '')
        if (debug_mode) {
            logger.write('code: ' + code + '\n')
        }

        const sandbox = {}
        vm.runInNewContext(code, sandbox)
        var url = sandbox.playerSetup.playlist[0].sources.pop()
        var type = /.*\/(.*)/.exec(url.type)[1]
        var label = url.label
        var filename = dir + "/[" + anime_name + "]" + "[" + episode_number + "][" + label + "]." + type
        var file = fs.createWriteStream(filename)
        var display_name = dir + ' - ' + episode_number
        var bar_format = right_pad(display_name, 40) + ".white[:bar].green :percent.yellow :ets sec :speed kB/s"
        var progress_bar, last_tick = 0

        progress(request(url.file))
            .on('progress', function (state) {
                if (!progress_bar) {
                    progress_bar = new ProgressBar({
                        schema: bar_format,
                        width: 50,
                        filled: '#',
                        blank: ' ',
                        total: state.size.total
                    })
                }
                var delta_tick = state.size.transferred - last_tick
                progress_bar.tick(delta_tick, {
                    speed: (state.speed / 1000).toFixed(2),
                    ets: state.time.remaining
                })
                last_tick = state.size.transferred
            })
            .on('end', function () {
                console.log(filename + " done!")
            })
            .pipe(file)
    }
}

var video = new Crawler({
    forceUTF8: true
})

var page = new Crawler({
    forceUTF8: true,
    callback: function(error, result, $){
        name = /^([^\[]*)\[.*\[.*\]\]\W+\](\[.*\])?$/.exec($('a#thread_subject').text())
        anime_name = (name[1] == undefined ? '' : name[1].trim())
        anime_status = (name[2] == undefined ? '' : name[2].trim())
        dir = "[" + anime_name + "]" + anime_status
        fs.existsSync(dir) || fs.mkdirSync(dir)

        $('a[href|="/thread"]').each(function(index, a){
            //console.log($(a).attr('href'))
            //console.log($(a).text())
            var episode_number = $(a).text()
            var href = $(a).attr('href')

            //console.log(/#.*/.exec(href))
            //console.log($('div' + /#.*/.exec(href)).children('span').attr('href'))
            var uri = $('div' + /#.*/.exec(href)).children('span').attr('href')
            uri && video.queue({
                uri: uri,
                callback: video_callback(dir, anime_name, episode_number)
            })
        })
    }
})

var debug_mode = false
if (process.argv[2] == '-d' || process.argv[2] == '--debug') {
    debug_log_name = 'debug_log.txt'
    console.log("Debug mode turned on.")
    console.log("Will write debug log into " + debug_log_name)
    debug_mode = true
    logger = fs.createWriteStream(debug_log_name, {
		defaultEncoding: 'utf8'
    })
    var page_list = process.argv.slice(3)
}
else {
    var page_list = process.argv.slice(2)
}

if(page_list.length > 0) {
    if (debug_mode) {
        logger.write("page_list:" + page_list + '\n')
    }

    page.queue(page_list)
}
else {
    console.log("node index.js [-d | --debug] <2dg-url> [<2dg-url> ...]")
}
