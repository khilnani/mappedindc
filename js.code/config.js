define('config',[], function() {
  "use strict";
  
  require.config({
    baseUrl: './js'
  });
  
  return {
    "paths": {
      "txt": "libs/text",
      "css": "libs/css",
      "async": "libs/async",
      "jquery": "libs/jquery.min",
      "bootstrap": "libs/bootstrap.min",
      "underscore": "libs/underscore-min",

      "api": "api",
      "config": "config",
      "localstore": "localstore",
      "logger": "logger",
      "main": "main",
      "mapview": "mapview",
      "templates": "templates"
    },
    "shim": {
      "bootstrap": ["jquery"]
    }
  };
});
