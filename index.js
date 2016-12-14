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

function select_possible_attribute(jQuery, attributes) {
    for (i = 0; i < attributes.length; i++) {
        tab = jQuery(attributes[i])

        if (tab.length > 0)
            return tab
    }
}

var video_callback = function(dir, anime_name, episode_number){
    return function(error, result, jQuery){
        if (debug_mode) {
            logger.write('result: ' + JSON.stringify(result) + '\n')
            logger.write('dir: ' + dir + '\n')
            logger.write('name: ' + name + '\n')
            logger.write('episode_number: ' + episode_number + '\n')
        }

        // parse js code
        var codes = jQuery('script'), code = null
        for (var i = 0; i < codes.length; i++) {
            var script = jQuery(codes[i]).text()
            if (script.indexOf('2,d,g,a,t,e') > -1) {
                code = script
                break
            }
        }

        if (!code) {
            console.log('failed: ' + anime_name + ' - ' + episode_number)
            return
        }

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
        if (url === undefined) {
            if (debug_mode)
                logger.write('Skip [' + anime_name + '][' + episode_number + '] because url is undefined.')
            return
        }

        var type = /.*\/(.*)/.exec(url.type)[1]
        var label = url.label
        if (episode_number)
            var filename = dir + "/[" + anime_name + "]" + "[" + episode_number + "][" + label + "]." + type
        else
            var filename = dir + "/[" + anime_name + "]" + "[" + label + "]." + type
        var file = fs.createWriteStream(filename)

        if (episode_number)
            var display_name = dir + ' - ' + episode_number
        else
            var display_name = dir
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
    callback: function(error, result, jQuery){
        name = /^([^\[]*)\[.*\[.*\]\]\W+\](\[.*\])?$/.exec(jQuery('a#thread_subject').text())
        anime_name = (name[1] == undefined ? '' : name[1].trim())
        anime_status = (name[2] == undefined ? '' : name[2].trim())
        dir = "[" + anime_name + "]" + anime_status
        if (debug_mode) {
            logger.write('name: ' + name + '\n')
            logger.write('anime_name: ' + anime_name + '\n')
            logger.write('anime_status' + anime_status + '\n')
            logger.write('dir: ' + dir + '\n')
        }

        fs.existsSync(dir) || fs.mkdirSync(dir)

        var episode_number = ''

        multi_tabs = jQuery('a[href|="/thread"]')
        if (multi_tabs.length > 0) {
            if (debug_mode) {
                logger.write('multi_tabs' + '\n')
                logger.write('multi_tabs.length: ' + multi_tabs.length + '\n')
                logger.write('multi_tabs: ' + multi_tabs + '\n')
            }

            multi_tabs.each(function(index, a){
                episode_number = jQuery(a).text()
                var href = jQuery(a).attr('href')
                if (debug_mode) {
                    logger.write('episode_number: ' + episode_number + '\n')
                    logger.write('href: ' + href + '\n')
                }

                var uri = jQuery('div' + /#.*/.exec(href)).children('span').attr('href')
                uri && video.queue({
                    uri: uri,
                    callback: video_callback(dir, anime_name, episode_number)
                })
            })
        }
        else {
            // single tab
            possible_attributes = ['td.t_f > div > span', 'td.t_f > span']
            single_tab = select_possible_attribute(jQuery, possible_attributes)

            if (debug_mode) {
                logger.write('single_tab' + '\n')
                logger.write('single_tab.length: ' + single_tab.length + '\n')
                logger.write('single_tab: ' + single_tab + '\n')
            }

             var uri = single_tab.attr('href')
             uri && video.queue({
                 uri: uri,
                 callback: video_callback(dir, anime_name, episode_number)
             })

        }
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
