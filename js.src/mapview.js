define('mapview', ['jquery', 'underscore', 'api', 'localstore', 'logger','templates','bootstrap', 'async!http://maps.googleapis.com/maps/api/js?v=3.exp&sensor=false'], function($, _, API, store, log, Templates) {
  "use strict";
  
  //---------------------------------------------------------
   
  //var gwin = window.open('');
  
  //----------------------------------------------
  //----------------------------------------------
  
  function MapView () {

    var companyMax = 500;
    var minZip = 20000;
    var maxZip = 23000;

    // McLean, VA
    var initialLocation = new google.maps.LatLng(38.93, -77.18);
    
    var map;

    var infoWindow = new google.maps.InfoWindow({disableAutoPan: false});
    var markers = {};
    var companyFollows = {}; // key: id, value: name
    var companies = [];
    
    var geocodes = {}; // l_id: { lat, lng }
    var industries = []; // {id, name}
    var defaultIndustry = undefined;

    //---------------------------------------------------------

    function getCompanies(start, industry) {
      if(start == undefined || start == 0) {
        start=0;
        clearMarkers();
      }
      if(industry == undefined) industry = defaultIndustry;
      
      API.getCompanies(start, industry).done(function (result) {
        log.info('getCompanies(): Start: ' + start + ' Max: ' + companyMax + ' sofar: ' + companies.length);
        
        $('#loadingStatus').html('<span class="text-warning">Loading LinkedIn data (' + companies.length + '/' + companyMax + ') ...</span>');
        
        var batchSize = Number(result.companies._count);
        
        companies = companies.concat(result.companies.values);
        if(companies.length >= companyMax || companies.length >= Number(result.companies._total)) {
          setTimeout(function () {
            processCompany();
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
        var locations = company.locations.values;
        if(locations) {
          processLocation(company, locations).done(function() {
            processCompany();
          }); 
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
          
          if(geocodes[company.id + '_' + zip]) {
            log.info('processLocation() USING CACHED GEOCODES');
            var loc = geocodes[company.id + '_' + zip];
            addMarker(company.name, a_index, loc.lat, loc.lng, company.id);
            processLocation(company, locations, deferred);
          } else {
            API.geocodeAddress(google, company, location, a_index).done(function(loc) {
              if(loc) {
                addMarker(company.name, a_index, loc.lat, loc.lng, company.id);
                try{
                  if(gwin) {
                    gwin.document.write( '"' + company.id + '_' + zip + '": { "lat": ' + loc.lat +  ', "lng": ' + loc.lng + '}, ' );
                  }
                } catch (e) {}
              } else {
                log.info("processLocation(): " + company.name + "(" + company.name + ") @ " + zip + " NO LOC");
              }
              processLocation(company, locations, deferred);
            }).fail(function(error) {
              log.warn("processLocation(): " + company.name + "(" + company.name + ") @ " + zip + " Error: " + error);
              processLocation(company, locations, deferred);
            });
          }
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
      log.info('getCompanyFollows()');
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
    
    //----------------------------------------------
    
    this.resetView = function () {
      log.info('resetView()');
      
      clearMarkers();
      
      markers = {};
      companyFollows = {}; // key: id, value: name
      companies = [];
    }
    
    this.refreshView = function (industry) {
      log.info('refreshView()');
      getCompanies(0, industry);
    }
    
    this.initView = function (_geocodes, _industries, _defaultIndustry) {
      log.info('initView()');
      
      this.resetView();
      
      geocodes = _geocodes;
      industries = _industries;
      defaultIndustry = _defaultIndustry;

      getCompanyFollows(setupMap);
    }
    
  }
  
  //----------------------------------------------
  //----------------------------------------------
  
  var view = new MapView();
  
  return view;

});
