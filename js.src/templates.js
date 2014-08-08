define('templates',['jquery', 'logger'], function($, log) {
  "use strict";
  
  var Templates = {
    cache: {},
    
    load: function (list) {
      
      log.debug('Templates.load() ' + list);
      
      var deferred = $.Deferred();
      
      if(list) {
        var deferArray = [];
        var self = this;
        $.each(list, function (idx, url) {
          log.trace('Templates.load() loading ' + url);
          var loader = $.get('templates/' + url + '.html').done( function(data) {
            log.trace('Templates.load() loaded ' +  url);
            self.cache[url] = data;
          }).fail( function(jqXhr, status, error) {
            log.error('Templates.load() Unable to load url: ' + url + ' status: ' + status);
            log.error(error);
            deferred.reject(error);
          });
          deferArray.push(loader);
        });
        
        $.when.apply(null, deferArray).done( function () {
          log.debug('Templates Done.')
          deferred.resolve();
        });
      } else {
        log.debug('Templates Done.')
        deferred.resolve();
      }
      
      return deferred;
    },
    
    get: function (url) {
      return this.cache[url];
    }
    
  }
  
  return Templates;
  
});
