require('dotenv').config();
var fs = require('fs');
var _ = require('lodash/core');
var cheerio = require('cheerio');
var Twitter = require('twitter');
var phantomJsCloud = require('phantomjscloud');

function send_tweet(message) {
  var twitter = new Twitter({
    consumer_key: process.env.TWITTER_KEY,
    consumer_secret: process.env.TWITTER_KEY_SECRET,
    access_token_key: process.env.TWITTER_TOKEN,
    access_token_secret: process.env.TWITTER_TOKEN_SECRET
  });
  if (process.env.NODE_ENV == 'production') {
    twitter.post('statuses/update', {status: message}, function(error, tweet, response) {
      if (error) throw error;
    });
  }
}

var browser = new phantomJsCloud.BrowserApi(process.env.PHANTOMJSCLOUD_KEY);
browser.requestSingle({ url: 'http://projects.fivethirtyeight.com/2016-election-forecast/', renderType: 'html', ignoreImages: true}, function(err, userResponse) {
  if (err) throw err;
  var $ = cheerio.load(userResponse.content.data);
  var clinton_chance,
      trump_chance,
      chances_of_winning = $('.winprob-bar .candidate-text'),
      get_chance_val = function(el) {
        var str = el.find('.candidate-val.winprob').html();
        return Math.round(str.slice(0, str.indexOf('<span class="candidate-percent-sign">')));
      };
  chances_of_winning.each(function() {
    if ($(this).html().indexOf('Clinton') > -1) {
      clinton_chance = get_chance_val($(this));
    } else if ($(this).html().indexOf('Trump') > -1) {
      trump_chance = get_chance_val($(this));
    }
  });
  var close_states = [];
  $('.chart g.state rect[data-state]').slice(0, 5).each(function() {
    close_states.push($(this).attr('data-state'));
  });
  var scrape = {
    'clinton_chance': clinton_chance,
    'trump_chance': trump_chance,
    'close_states': close_states
  };
  fs.readFile('record.json', function(err, data) {
    if (err && err.code == 'ENOENT') {
      fs.writeFile('record.json', JSON.stringify({'current': scrape, 'previous': {}}));
    } else if (!err) {
      var record = JSON.parse(data);
      record.previous = record.current;
      record.current = scrape;
      fs.writeFile('record.json', JSON.stringify(record), function(err) {
        if (err) throw err;
        if (!_.isEqual(record.current, record.previous)) {
          var message = 'New election forecast from @FiveThirtyEight. Chance of winning: Clinton ' + record.current.clinton_chance + '%, Trump ' + record.current.trump_chance + '%. Closest: ' + record.current.close_states.join(', ') + '. http://projects.fivethirtyeight.com/2016-election-forecast/';
          console.log('New: ' + JSON.stringify(scrape));
          send_tweet(message);
        } else {
          console.log('Unchanged: ' + JSON.stringify(scrape));
        }
      });
    }
  })
});
