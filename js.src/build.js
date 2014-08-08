({
  baseUrl: ".",
  findNestedDependencies: true,
  preserveLicenseComments: false,
  optimize: "uglify2",
  generateSourceMaps: true,
  name: "main",
  out: "../js/main.min.js",
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
  } 
})
