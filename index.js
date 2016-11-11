const Crawler = require("crawler")
const fs = require("fs")
const vm = require('vm')
const request = require('request')
const unpack = require('unpacker').unpack

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
        console.log(filename)
        request(url.file)
            .on('end', function(){
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
