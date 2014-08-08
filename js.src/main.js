require(['config'], function(config) {
  "use strict";
  
  require.config(config);
  
  require(['jquery', 'underscore', 'api', 'localstore', 'logger','templates','bootstrap', 'async!http://maps.googleapis.com/maps/api/js?v=3.exp&sensor=false'], function($, _, API, store, log, Templates) {
    
    //---------------------------------------------------------
    //---------------------------------------------------------
   
    var inited = false;
    var companyMax = 500;
    var minZip = 20000;
    var maxZip = 23000;
    var defaultIndustry = (store.get('defaultIndustry')) ? Number(store.get('defaultIndustry')) : 6; //internet

    // McLean, VA
    var initialLocation = new google.maps.LatLng(38.93, -77.18);
    
    var map;

    var infoWindow = new google.maps.InfoWindow({disableAutoPan: false});
    var markers = {};
    var companyFollows = {}; // key: id, value: name
    var companies = [];
    
    //---------------------------------------------------------
    //---------------------------------------------------------
    

/*
    function repositionMap(loc) {
      console.log('repositionMap: Lat' + loc.lat() + ' Lng: ' + loc.lng());
      geocoder.geocode({'latLng': loc}, function (results, status) {
        if( status == google.maps.GeocoderStatus.OK) {
          if (results[1]) {
            var f_address = results[1].formatted_address;
            console.log('Geocoded address: ' + f_address);
            var address = results[0].address_components;
            var zipcode = address[address.length - 1].long_name;
            console.log('Geocoded address ZIP: ' + zipcode); 

            loadZip(zipcode); 

          } else {
            console.log('No address found for LatLng');
          }
        } else if (status == google.maps.GeocoderStatus.OVER_QUERY_LIMIT ) {
          console.error('geocoder.geocode Limit Exceeded.');
        } else {
          console.error('geocoder.geocode Error.');
        }
      });
    }
*/
    function getCompanies(start, industry) {
      if(start == undefined || start == 0) {
        start=0;
        clearMarkers();
      }
      if(industry == undefined) industry = defaultIndustry;

      store.set('defaultIndustry', industry);

      API.getCompanies(start, industry).done(function (result) {
        log.info('getCompanies(): Start: ' + start + ' Max: ' + companyMax + ' Sofar: ' + companies.length);
        
        $('#loadingStatus').html('<span class="text-warning">Loading LinkedIn data (' + companies.length + '/' + companyMax + ') ...</span>');
        
        var batchSize = Number(result.companies._count);
        
        companies = companies.concat(result.companies.values);
        if(companies.length >= companyMax || companies.length >= Number(result.companies._total)) {
          setTimeout(function () {
            API.getGeocodes( industry ).done(function () {
              processCompany();
            });
          }, 500);
        } else {
          getCompanies(start + batchSize, industry);
        }
      }).fail( function(error) {
        $('#loadingStatus').html('<span class="text-danger">Map limited to saved companies. Please try again tomorrow for the full list.</span>');
        displayFollowedCompanies();
      });
    }
    
    function processCompany() {
      if(companies.length > 0) {
        log.debug('processCompany(): ' + companies.length);
        var company = companies.pop();
        if(company.locations && company.locations.values) {
          var locations = company.locations.values;
          processLocation(company, locations).done(function() {
            processCompany();
          }); 
        } else {
          processCompany();
        }
      } else {
        log.info('processCompany() Done.');
        $('#loadingStatus').html('<span class="text-success">Map data loaded.</span>');
      }
    }

    function validateZip(zip) {
      if(zip == undefined) {
        return false;
      }
      if(String(zip).indexOf(' ') > -1) {
        return false;
      }
      if(String(zip).indexOf('-') > -1) {
        zip = String(zip).split('-')[0];
      }
      if(String(zip).length != 5) {
        return false;
      }
      if (Number(zip) < minZip || Number(zip) > maxZip) {
        return false;
      }
      return true;
    }
    
    function processLocation(company, locations, deferred) {
      if(deferred == undefined) 
        deferred = new $.Deferred();
      
      if(locations.length > 0) {
        var location = locations.pop();
        var zip = location.address.postalCode;

        if( !validateZip(zip) ) {
          log.debug("processLocation(): " + company.name + "(" + company.name + ") @ " + zip + ' SKIPPED OUT OF BOUNDS');
          processLocation(company, locations, deferred);
        } else {
          var a_index = locations.length;
          
          log.info("processLocation(): " + company.name + "(" + company.name + ") @ " + zip);
          $('#loadingStatus').html('<span class="text-muted">Rendering ' + company.name + ' (' + companies.length + '/' + (a_index+1) + ') ...</span>');        
          
          API.geocodeAddress(google, company, location, a_index).done(function(loc) {
            if(loc) {
              addMarker(company.name, a_index, loc.lat, loc.lng, company.id);
            } else {
              log.info("processLocation(): " + company.name + "(" + company.name + ") @ " + zip + " NO LOC");
            }
            processLocation(company, locations, deferred);
          }).fail(function(error) {
            log.warn("processLocation(): " + company.name + "(" + company.name + ") @ " + zip + " Error: " + error);
            processLocation(company, locations, deferred);
          });
        }
      } else {
        log.debug('processLocation() Done: ' + company.id);
        deferred.resolve();
      }
      
      return deferred;
    }
    
    
    function addMarker(name, a_index, lat, lng, l_id) {
      log.info('addMarker(): ' + name + '_' + a_index + ' ' + lat + ', ' + lng);

      var loc = new google.maps.LatLng(lat, lng);
      var icon = (companyFollows[l_id] != undefined) ? 'images/markerSaved.png' : undefined;
      var marker = markers[name + '_' + a_index] = new google.maps.Marker({
          position: loc,
          map: map,
          title: name,
          icon: icon,
          l_id: l_id,
          a_index: a_index
        });
        
      google.maps.event.addListener(marker, 'mouseover', function(name, a_index, l_id) {
        return function () {
          var doesFollow = companyFollows[l_id] != undefined;
          infoWindow.setContent( markers[name + '_' + a_index].title + ' ' + (doesFollow ? '<span class="glyphicon glyphicon-star"></span>' : '<span class="glyphicon glyphicon-star-empty"></span>'));
          infoWindow.open(map, markers[name + '_' + a_index]);
        }
      }(name, a_index, l_id));
      
      google.maps.event.addListener(marker, 'mouseout', function() {
        infoWindow.close();
      });
      
      google.maps.event.addListener(marker, 'click', function(name, a_index) {
        return function() {
          loadMarker( name, a_index );
        }
      }(name, a_index));
      
    }

    function clearMarkers () {
      log.info('clearMarkers()');
      for( var ea in markers ) {
        log.debug('Clearing marker: ' + markers[ea].title);
        markers[ea].setMap(null);
      }
      markers = {};
    }

    function loadMarker(name, a_index) {
      log.info('Loading marker: ' + name + '_' + a_index);
      var l_id = markers[name + '_' + a_index].l_id;
      log.info('LinkedIn ID: ' + l_id);
      displayCompanyInfo(l_id);
    }
    
    function displayCompanyInfo (l_id) {
      log.info('displayCompanyInfo(): ' + l_id)
      if(l_id) {
        API.getCompanyInfo(l_id).done(function (result) {
          log.debug("Linkedin Company loaded: " + result.name)
          
          //--------------------------------------;
          $('#info_panel').attr('data-l-id', l_id);
          $('#info_panel').attr('data-c-name', result.name);
          
          result.doesFollow = companyFollows[l_id] != undefined;
          if(result.description)
            result.description = "<p>" + result.description.replace(/\r\n\r\n/g, "</p><p>").replace(/\n\n/g, "</p><p>") + "</p>";
          else
            result.description = '';
          var company_overview_tpl = Templates.get('company-overview');
          
          $('#info_panel').html( _.template( company_overview_tpl, result ) );
          
          //--------------------------------------
          $('#companyFollowBtn').click( function(l_id) {
            return function () {
              if(companyFollows[l_id] != undefined) {
                unFollowCompany();
              } else {
                followCompany();
              }
            }
          }(l_id));
          
          $('a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
            log.debug("Tab: " + e.target );
            if(("" + e.target).indexOf('news_panel') > -1)
              displayCompanyNews();
          });
          //--------------------------------------
        });
      } else {
        $('#info_panel').html( "Unable to locate a valid Linkedin ID for " + name + "." );
      }
    }    
    
    function displayCompanyNews () {
      var l_id = $('#info_panel').attr('data-l-id');
      log.info( "displayCompanyNews(): " + l_id + ": " + $('#news_panel').attr('data-loaded'));
      if(l_id) {
        if($('#news_panel').attr('data-loaded') == undefined) {
          API.getCompanyNews(l_id).done(function (result) {
            log.info("Linkedin Company News loaded.");
            var company_news_tpl = Templates.get('company-news');
            $('#news_panel').html( _.template( company_news_tpl, result ) );
          });
          $('#news_panel').attr('data-loaded', 'true');
        } else {
          log.info('Not loading news again.');
        }
      } else {
        $('#news_panel').html( "Unable to locate a valid Linkedin ID for " + name + "." );
      }
    }
    
    function getCompanyFollows(callback) {
      log.info('getCompanyFollows(): ' + inited);
      API.getCompanyFollows().done(function (result) {
        log.debug("Linkedin Company Follows loaded.");
        companyFollows = {};
        result.values.map( function (item) {
          companyFollows[ item.id ] = item.name;
          log.trace('getCompanyFollows(): ' + item.id + ': ' + companyFollows[ item.id ]);
        });
          
        // Wait till we have the data before allowing the btn to function
        $('#displayfollowedCompaniesLI').removeClass('hidden');
        $('#displayFollowedCompaniesBtn').click( function () {
          displayFollowedCompanies();
        });
          
        if(callback) 
          callback();
          
      });
    }
    
    function followCompany() {
      var l_id = $('#info_panel').attr('data-l-id');
      log.info('followCompany(): ' + l_id);
      if(l_id) {
        API.followCompany(l_id).done(function () {
          log.info("followCompany() Done.");
          $('#companyFollowStatus').removeClass('glyphicon-star-empty').addClass('glyphicon-star');
          
          var l_id = $('#info_panel').attr('data-l-id');
          var c_name = $('#info_panel').attr('data-c-name');
          companyFollows[ l_id ] = c_name;
        });
      }
    }
    
    function unFollowCompany() {
      var l_id = $('#info_panel').attr('data-l-id');
      log.info('unFollowCompany(): ' + l_id);
      if(l_id) {
        API.unFollowCompany(l_id).done(function (result) {
          log.info("unFollowCompany() Done.");
          $('#companyFollowStatus').removeClass('glyphicon-star').addClass('glyphicon-star-empty');
            
          var l_id = $('#info_panel').attr('data-l-id');
          delete companyFollows[ l_id ];
        });
      }
    }
    
    function displayFollowedCompanies () {
      log.info('displayFollowedCompanies()');
      
      var followed_companies_tpl = Templates.get('followed-companies');
      $('#info_panel').html( _.template( followed_companies_tpl, {values: companyFollows} ) );
      
      $('.followed-company').click(function (event) {
        var l_id = $(event.target).attr('data-l-id');
        log.debug('Clicked Followed Company: ' + l_id);
        displayCompanyInfo(l_id);
      });
    }
    
    //---------------------------------------------------------
    //---------------------------------------------------------
    
    function init() {
      log.debug('init(): ' + inited);
      
      $('#login-instr').addClass('hidden');
      
      if(!inited) {
        inited = true;      
        getIndustries().done(function () {
          getCompanyFollows(setupMap);
        });
      }
    }

    function getIndustries() {
      log.info('getIndustries()');
      var deferred = new $.Deferred();
      
      $.getJSON("data/industries.json").done(function( industries ) {
        log.debug('getIndustries() RECD');
        for( var i in industries) {
          var ind = industries[i];
          log.debug('Adding industry: ' + ind.id + '(' + ind.name + ')')
          $('#industry-dropdown').append('<li><a href="#" class="industry-link" data-id="' + ind.id+ '" data-name="' + ind.name + '">' + ind.name + '</a></li>');
          if(ind.id == defaultIndustry) {
            $('#industry-label').html(ind.name);
          }
        }
        $('.industry-link').click( function (e) { 
          var industry = $(e.target).attr('data-id');
          var industryName = $(e.target).attr('data-name');
          $('#industry-label').html( industryName );
          setTimeout( function () {
            getCompanies(0, industry);
          }, 500);
        });
      }).always(function() {
        deferred.resolve();
      });
      
      return deferred;
    }

    function setupMap() {
      log.info('setupMap()');
      var mapOptions = {
        zoom: 11,
        mapTypeId: google.maps.MapTypeId.ROADMAP
      };
      map = new google.maps.Map(document.getElementById("main_panel"), mapOptions);
      
      if(navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(function(position) {
          initialLocation = new google.maps.LatLng(position.coords.latitude,position.coords.longitude);
        }, function() {
          log.error('Geolocation service failed.');
        });
      }

      //repositionMap( initialLocation);
      map.setCenter(initialLocation);
      getCompanies(0, defaultIndustry);

      google.maps.event.addListener(map, "click", function (event) {
        var lat = event.latLng.lat();
        var lng = event.latLng.lng();
        log.debug('Click Lat: ' + lat + ' Lng: ' + lng);
        //repositionMap(event.latLng);
      });
    }
    
    function home() {
      log.info('home()');
      var home_tpl = Templates.get('home');
      $('#info_panel').html( _.template( home_tpl ) );
    }
    
    function postLogout() {
      inited = false;
      companyFollows = {}; // key: id, value: name
      companies = [];
      home();
      $('#loadingStatus').html('<span class="text-muted">Please log in.</span>');
      $('#displayfollowedCompaniesLI').addClass('hidden');
      $('#login-instr').removeClass('hidden');
    }

    //---------------------------------------------------------
    //---------------------------------------------------------

    $(function () {
      
      log.event('main()');

      var logLevel = 3;      
      if(store.get('loglevel')) {
        logLevel = store.get('loglevel');
      } else {
        store.set('loglevel', logLevel);
      }
      log.setLogLevel( logLevel );

      if(log.getLogLevel() >= 5) {
        window.gwin = window.open('');
      }

      Templates.load(['company-overview', 'company-news', 'followed-companies', 'home']).done( function () {
        
        home();
        
        $('#homeBtn').click(function (e) {
          home();
        });
        
        $('#logoutBtn').click(function (e) {
          if(IN.User.isAuthorized() && confirm('Logout?')) {
            IN.User.logout(postLogout, window);
          }
        });
       
        IN.Event.on(IN, "auth", init);
        IN.Event.on(IN, "logout", postLogout, window);
        IN.User.authorize(init, window);

      });
      
    });
    //----------------------------------------------
  });

});
