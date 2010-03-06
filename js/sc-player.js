;(function($) {
  // Convert milliseconds into Hours (h), Minutes (m), and Seconds (s)
  var timecode = function(ms) {
    var hms = function(ms) {
          return {
            h: Math.floor(ms/(60*60*1000)),
            m: Math.floor((ms/60000) % 60),
            s: Math.floor((ms/1000) % 60)
          };
        }(ms),
        tc = []; // Timecode array to be joined with '.'

    if (hms.h > 0) {
      tc.push(hms.h);
    }

    tc.push((hms.m < 10 && hms.h > 0 ? "0" + hms.m : hms.m));
    tc.push((hms.s < 10  ? "0" + hms.s : hms.s));

    return tc.join('.');
  };
  
  var engineId = 'scPlayerEngine',
      domain = 'soundcloud.com', // 'soundcloud.com'
      audioHtml = function(url) {
            return '<object height="1" width="1" id="' + engineId + '" classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"><param name="movie" value="http://player.' + domain +'/player.swf?url=' + url +'&amp;enable_api=true&amp;player_type=tiny&amp;object_id=' + engineId + '"></param><param name="allowscriptaccess" value="always"></param><embed allowscriptaccess="always" height="1" src="http://player.' + domain +'/player.swf?url=' + url +'&amp;enable_api=true&amp;player_type=tiny&amp;object_id=' + engineId + '" type="application/x-shockwave-flash" width="1" name="' + engineId + '"></embed></object>';
          },
      autoPlay = false,
      scApiUrl = function(url) {
        return (/api\./.test(url) ? url + '?' : 'http://api.' + domain +'/resolve?url=' + url + '&') + 'format=json&consumer_key=htuiRd1JP11Ww0X72T1C3g&callback=?';
      },
      resolveUrl = function(url) {
        return scApiUrl('http://api.' + domain +'/resolve?url=' + url);
      },
      audioEngine,
      players = [],
      updates = {},
      currentUrl,
      checkAudioEngine = function() {
        // init the engine if it's not ready yet
        var url = players[0] && players[0].tracks && players[0].tracks[0].permalink_url;
        // console.log('checkAudioEngine', url);
        if(url && !document.getElementById(engineId)){
          currentUrl = url;
          $(audioHtml(url)).appendTo(document.body);
        }
      },

      parsePlayerData = function($player, links) {
        var index = 0,
            playerObj = {node: $player, tracks: []},
            loadUrl = function(link) {
              $.getJSON(scApiUrl(link.url), function(data) {
                // console.log('data loaded', link.url, data);
                index += 1;
                // debugger;
                if(data.tracks){
                  console.log('data.tracks', data.tracks);
                  playerObj.tracks = playerObj.tracks.concat(data.tracks);
                }else if(data.duration){
                  // if track, add to player
                  playerObj.tracks.push(data);
                }else if(data.username){
                  // if user, get his tracks or favorites
                  if(/favorites/.test(link.url)){
                    // console.log('user lets get favorites');
                    links.push({url:data.uri + '/favorites'});
                  }else{
                    links.push({url:data.uri + '/tracks'});
                  }
                }else if($.isArray(data)){
                  playerObj.tracks = playerObj.tracks.concat(data);
                }
                if(links[index]){                    
                  loadUrl(links[index]);
                }else{
                  playerObj.node.trigger({type:'onTrackDataLoaded', playerObj: playerObj});
                  // console.log('----- yaha, all loaded', playerObj.tracks);
                }
             });
           };
        // update the players queue
        players.push(playerObj);
        
        // load first tracks
        loadUrl(links[index]);
      },
      updateTrackInfo = function($player, track) {
        // update the current track info in the player
        $('.sc-info', $player).each(function(index) {
          console.log('updateTrackInfo', track);
          $('h3', this).html('<a href="' + track.permalink_url +'">' + track.title + '</a>');
          $('h4', this).html('by <a href="' + track.user.permalink_url +'">' + track.user.username + '</a>');
          $('p', this).html(track.description || 'no Description');
        });
        updates = {$buffer: $('.sc-buffer', $player), $played: $('.sc-played', $player), position:  $('.sc-position', $player)[0],  duration: $('.sc-duration', $player)[0]};
        updates.duration.innerHTML = timecode(track.duration);
      },
      pollForLoad = function() {
        setTimeout(function() {
          if(audioEngine.api_getCurrentTrack && audioEngine.api_getCurrentTrack().permalinkUrl === currentUrl){
            audioEngine.api_play();
          }else{
            pollForLoad();
          }
        }, 300);
      },
      play = function(track) {
        var url = track.permalink_url;
        if(audioEngine){
          if(currentUrl !== url){
            currentUrl = url;
            // console.log('will load', url);
            audioEngine.api_load(url);
            autoPlay = true;
            // FIXME if the ready events from player would work, shouldn't need this one
            pollForLoad();
          }else{
            // console.log('will play');
            audioEngine.api_play();
          }
        }
      },
      getPlayerData = function(node) {
        return players[$(node).data('sc-player').id];
      },
      onPlay = function(node, id) {
        var track = getPlayerData(node).tracks[id || 0];
        updateTrackInfo(node, track);
        // console.log('onPlay', id, track);
        play(track);
      },
      onPause = function(node) {
        audioEngine.api_pause();
      },
      onSeek = function(node, relative) {
        audioEngine.api_seekTo((audioEngine.api_getTrackDuration() * relative));
      },
      positionPoll;
  
    // listen to audio events
    soundcloud.addEventListener('onPlayerReady', function(flashId, data) {
      console.log('audio engine is ready');
      // init the audio engine if not been done yet
      if(!audioEngine){
        audioEngine = soundcloud.getPlayer(engineId);
      }

      
      // FIXME in the widget the event doesnt get fired after the load()
      if(autoPlay){      
        this.api_play();
      }
    });
    
    soundcloud.addEventListener('onMediaEnd', function(flashId, data) {
      console.log('track finished get the next one');
      if(autoPlay){      
        $('.sc-trackslist li.active').next('li').click();
      }
    });
    
    soundcloud.addEventListener('onMediaBuffering', function(flashId, data) {
      // console.log('track loading:' + data.percent + '%');
      updates.$buffer.css('width', data.percent + '%');
    });
    
    soundcloud.addEventListener('onMediaPlay', function(flashId, data) {
      var duration = audioEngine.api_getTrackDuration() * 1000;
      clearInterval(positionPoll);
      positionPoll = setInterval(function() {
        var position = audioEngine.api_getTrackPosition() * 1000;
        updates.$played.css('width', ((position / duration) * 100) + '%');
        updates.position.innerHTML = timecode(position); 
      }, 50);
    });
    
    soundcloud.addEventListener('onMediaPause', function(flashId, data) {
      clearInterval(positionPoll);
    });
    
  

  
  // Generate skinnable HTML/CSS/JavaScript based SoundCloud players from links to SoundCloud resources
  $.scPlayer = function(node, options) {
    var opts = $.extend({}, $.fn.scPlayer.defaults, options),
        playerId = players.length,
        $source = $(node),
        links = $.map($('a', $source).add($source.filter('a')), function(val) { return {url: val.href, title: val.innerHTML}; }),
        $player = $('<div class="sc-player loading"></div>').data('sc-player', {id: playerId}),
        $artworks = $('<ol class="sc-artwork-list"></ol>').appendTo($player),
        $info = $('<div class="sc-info"><h3></h3><h4></h4><p></p><a href="#" class="sc-info-close">X</a></div>').appendTo($player),
        $controls = $('<div class="sc-controls"></div>').appendTo($player),
        $list = $('<ol class="sc-trackslist"></ol>').appendTo($player);
        
        // adding controls to the player
        $player
          .find('.sc-controls')
            .append('<a href="#" class="sc-play">Play</a> <a href="#" class="sc-pause hidden">Pause</a>')
          .end()
          .append('<a href="#" class="sc-info-toggle">Info</a>')
          .append('<div class="sc-scrubber"></div>')
            .find('.sc-scrubber')
              .append('<div class="sc-time-span"><div class="sc-buffer"></div><div class="sc-played"></div></div>')
              .append('<div class="sc-time-indicators"><span class="sc-position"></span> | <span class="sc-duration"></span></div>');
        
        parsePlayerData($player, links);
        
        $player.bind('onTrackDataLoaded', function(event) {
          // console.log('got it!!!!!', event.playerObj, playerId, event.target);
          var tracks = event.playerObj.tracks;
          $.each(tracks, function(index, track) {
            var active = index === 0;
            $('<li>' + track.title + ', ' + timecode(track.duration) + '<a href="" class="buy">buy</a></li>').data('sc-track', {id:index}).toggleClass('active', active).appendTo($list);
            if(opts.loadArtworks){
              var img = track.artwork_url ? '<img src="' + track.artwork_url.replace('-large', '-t300x300') + '"/>' : '<div class="sc-no-artwork">No Artwork</div>';
              $('<li>' + img +'</li>').appendTo($artworks).toggleClass('active', active);
            }
          });
          $player.removeClass('loading');
          // update the element before rendering it in the DOM
          $player.each(opts.beforeRender);
          // set the first track's duration
          $('.sc-duration', $player)[0].innerHTML = timecode(tracks[0].duration);
          $('.sc-position', $player)[0].innerHTML = timecode(0);
          
          // set up the first track info
          updateTrackInfo($player, tracks[0]);
          // check if audio engine is inited properly
          checkAudioEngine();
        });


    // replace the data source
    $source.replaceWith($player);

    return $player;
  };
  
  
  $.fn.scPlayer = function(options) {

    return this.each(function() {
      $.scPlayer(this, options);
    });
  };

  // default options
  $.fn.scPlayer.defaults = {
    // do something with dom object before you render it, add nodes, etc.
    beforeRender  :   function() {
      var $player = $(this);
    },
    // initialization, when dom is ready
    onDomReady  : function() {
      $('a.sc-player, div.sc-player').scPlayer();
    },
    loadArtworks: true
  };
  
  // the GUI event bindings
  // toggling play/pause
  $('a.sc-play, a.sc-pause').live('click', function(event) {
    var $player = $(this).closest('.sc-player'),
        play = (/play/).test(this.className);
    if (play) {
      onPlay($player);
    }else{
      onPause($player);
    }
    $player.toggleClass('playing', play);
    return false;
  });
  
  $('a.sc-info-toggle, a.sc-info-close').live('click', function(event) {
    var $link = $(this);
    $link.closest('.sc-player')
      .find('.sc-info').toggleClass('active').end()
      .find('a.sc-info-toggle').toggleClass('active');
    return false;
  });

  
  $('.sc-trackslist li').live('click', function(event) {
    var $track = $(this),
        $player = $track.closest('.sc-player'),
        trackId = $track.data('sc-track').id,
        play = $player.is(':not(.playing)') || $track.is(':not(.active)');
    if (play) {
      onPlay($player, trackId);
    }else{
      onPause($player);
    }
    $track.addClass('active').siblings('li').removeClass('active');
    $player.toggleClass('playing', play);
    $('.artworks li', $player).each(function(index) {
      $(this).toggleClass('active', index === trackId);
    });
    return false;
  });
  
  // seeking in  buffer
  $('.sc-buffer').live('click', function(event) {
    var $buffer = $(this),
        $available = $buffer.closest('.sc-time-span'),
        $player = $buffer.closest('.sc-player'),
        relative  = (event.pageX  - $available.offset().left) / $available.width();
    onSeek($player, relative);
    return false;
  });
  
  $(function() {
    $.fn.scPlayer.defaults.onDomReady();
  });

})(jQuery);
