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

var video_callback = function(dir, name){
    return function(error, result, $){
        //console.log(result)
        //console.log(dir)
        //console.log(name)

        //console.log(result)
        //console.log($("script").last().text())
        // parse js code
        //var code = /eval\((.*)\);/.exec($("script").last().text())[1]
        var code = $("script").last().text()
        //console.log(code)
        code = unpack(code)
        code = code.replace(/player\.on(.|[\n\r])*/, '')
        code = code.replace(/var player=jwplayer\('videoContainer'\);/, '')
        code = code.replace(/player.setup\(playerSetup\)/, '')
        //console.log(code)
        const sandbox = {}
        vm.runInNewContext(code, sandbox)
        var url = sandbox.playerSetup.playlist[0].sources.pop()
        var type = /.*\/(.*)/.exec(url.type)[1]
        var label = url.label
        var filename = dir + "/[" + name + "][" + label + "]." + type
        var file = fs.createWriteStream(filename)
        var display_name = dir + ' - ' + name
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
        name = /([^\[]*)\[.*\](\[.*\])(?:\[END\])?/.exec($('a#thread_subject').text())
        dir = "[" + name[1] + "]" + name[2]
        fs.existsSync(dir) || fs.mkdirSync(dir)

        $('a[href|="/thread"]').each(function(index, a){
            //console.log($(a).attr('href'))
            //console.log($(a).text())
            var number = $(a).text()
            var href = $(a).attr('href')
            //console.log(/#.*/.exec(href))
            //console.log($('div' + /#.*/.exec(href)).children('span').attr('href'))
            var uri = $('div' + /#.*/.exec(href)).children('span').attr('href')
            uri && video.queue({
                uri: uri,
                callback: video_callback(dir, number)
            })
        })
    }
})

var page_list = process.argv.slice(2)
//console.log(page_list)
if(page_list.length > 0)
    page.queue(page_list)
else
    console.log("node index.js <2dg-url>")
