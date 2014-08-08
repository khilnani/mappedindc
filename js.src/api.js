define('api',['jquery', 'localstore','logger'], function($, store, log) {
  "use strict";
  
    var geocodeDelay = 1000;
    var geocodeOverload = 0;
    var geocodeLimit = 10;
   
    window.geocodes = {};

    var api = {
    //--------------------------------------------------
      geocoder: undefined,
      google: undefined,
      geocodes: {},

      getGeocodes: function (id) {
        log.info('getGeocodes(): ' + id);
        var deferred = new $.Deferred();
        
        $.getJSON("data/geocodes/" + id + ".json").done(function(data) {
          log.debug('getGeocodes() RECD');
          window.geocodes = data;
        }).fail(function (error) {
          log.warn('getGeocodes(): ' + error);
        }).always(function() {
          deferred.resolve();
        });
        
        return deferred;
      },
      
      geocodeAddress: function(google, company, location, a_index) {
        var deferred = new $.Deferred();
        
        if(!this.google) {
          this.google = google;
          this.geocoder = new google.maps.Geocoder();
        }
        
        var a = location.address;
        var street = a.street1 + ', ' + a.postalCode;
        log.info('API.geocodeAddress(): ' + company.id + " : " + a_index + " : " + street);

        if(window.geocodes[company.id + '_' + a.postalCode]) {
          log.debug('API.geocodeAddress() RESOLVE JSON');
          deferred.resolve( window.geocodes[company.id + '_' + a.postalCode] );
        } else if(store.get('geocodes', company.id + '_' + a.postalCode)) {
          log.debug('API.geocodeAddress() RESOLVE CACHE');
          deferred.resolve(store.get('geocodes', company.id + '_' + a.postalCode));
        } else if(geocodeOverload > geocodeLimit) {
          deferred.reject( google.maps.GeocoderStatus.OVER_QUERY_LIMIT );
        } else {
          this.geocoder.geocode({address: street}, function(company, postalCode, a_index, deferred) {
            return function (results, status) {
              if(status == google.maps.GeocoderStatus.OK && results && results[0]) {
                log.info('API.geocodeAddress() RESOLVE API: ' + company.id + " : " + a_index + " : " + postalCode + " : " + status);
                var loc = results[0].geometry.location;
                store.set('geocodes', company.id + '_' + a.postalCode, {lat: loc.lat(), lng: loc.lng()});
                
                try {
                  window.gwin.document.write( '"' + company.id + '_' + a.postalCode + '": { "lat": ' + loc.lat() +  ', "lng": ' + loc.lng() + '}, ' );
                } catch(e) { } 

                setTimeout(function() {
                  deferred.resolve({lat: loc.lat(), lng: loc.lng()});
                }, geocodeDelay);
              } else if (status == google.maps.GeocoderStatus.ZERO_RESULTS) {
                log.info('API.geocodeAddress() RESOLVE ZERO: ' + company.id + " : " + a_index + " : " + postalCode + " : " + status);
                store.set('geocodes', company.id + '_' + a.postalCode, undefined);
                setTimeout(function() {
                  deferred.resolve();
                }, geocodeDelay);
              } else if (status == google.maps.GeocoderStatus.OVER_QUERY_LIMIT ) {
                geocodeOverload++;
                log.warn('API.geocodeAddress() REJECT: ' + company.id + " : " + a_index + " : " + postalCode + " : " + status + " : " + geocodeOverload);
                setTimeout(function() {
                  deferred.reject(status);
                }, geocodeDelay);
              } else {
                log.warn('API.geocodeAddress() REJECT: ' + company.id + " : " + a_index + " : " + postalCode + " : " + status);
                setTimeout(function() {
                  deferred.reject(status);
                }, geocodeDelay);
              }
            }
          }(company, a.postalCode, a_index, deferred));
        }
        return deferred;
      },
  
      getCompanyFollows: function () {
        log.debug('API.getCompanyFollows()', arguments);
        var deferred = new $.Deferred();
        IN.API.Raw("/people/~/following/companies?start=0&count=500").result(function (result) {
          log.debug('API.getCompanyFollows() RESOLVE');
          deferred.resolve(result);
        }).error(function(error) {
          log.error('API.getCompanyFollows() REJECT');
          deferred.reject(error);
        });
        return deferred;
      },
      
      followCompany: function (l_id) {
        log.debug('API.followCompany() ', arguments);
        var deferred = new $.Deferred();
        IN.API.Raw("/people/~/following/companies")
          .method("POST")
          .body( JSON.stringify({id: l_id}))
          .result(function (result) {
            log.debug("API.followCompany() RESOLVE.");
            deferred.resolve(result);
          })
          .error(function(error) {
            log.error('API.followCompany() REJECT');
            deferred.reject(error);
          });
        return deferred;
      },
      
      unFollowCompany: function (l_id) {
        log.debug('API.unFollowCompany() ', arguments);
        var deferred = new $.Deferred();
        IN.API.Raw("/people/~/following/companies/id=" + l_id)
          .method("DELETE")
          .result(function (result) {
            log.debug("API.unFollowCompany() RESOLVE.");
            deferred.resolve(result);
          })
          .error(function(error) {
            log.error('API.unFollowCompany() REJECT');
            deferred.reject(error);
          });
        return deferred;
      },
      
      getCompanies: function (start, industry) {
        log.debug('API.getCompanies() ', arguments);
        var deferred = new $.Deferred();
        if(store.get('companies_' + industry, start)) {
          log.debug("API.getCompanies() RESOLVE CACHE");
          deferred.resolve( store.get('companies_' + industry, start) );
        } else {
          IN.API.Raw("/company-search:(companies:(id,name,website-url,locations))?hq-only=true&facet=location,us:97&facet=industry," + industry + "&count=20&start=" + start ).result(function (result) {
            store.set('companies_' + industry, start, result);
            log.debug("API.getCompanies() RESOLVE");
            deferred.resolve(result);
          }).error( function(error) {
            log.error('API.getCompanies() REJECT');
            deferred.reject(error);
          });
        }
        return deferred;
      },
      
      getCompanyInfo: function (l_id) {
        log.debug('API.getCompanyInfo() ', arguments);
        var deferred = new $.Deferred();
        if(store.get('company', l_id)) {
          log.debug("API.getCompanyInfo() RESOLVE CACHE");
          deferred.resolve( store.get('company', l_id) );
        } else {
          IN.API.Raw("/companies/" + l_id + ":(id,name,description,industry,logo-url,website-url,company-type,industries,twitter-id,blog-rss-url,employee-count-range,stock-exchange,founded-year,end-year,num-followers)").result(function (result) {
            store.set('company', l_id, result);
            log.debug("API.getCompanyInfo() RESOLVE");
            deferred.resolve(result);
          }).error( function(error) {
            log.error('API.getCompanyInfo() REJECT');
            deferred.reject(error);
          });
        }
        return deferred;
      },
      
      getCompanyNews: function (l_id) {
        log.debug('API.getCompanyNews() ', arguments);
        var deferred = new $.Deferred();
        IN.API.Raw("/companies/" + l_id + "/updates?start=0&count=20").result(function (result) {
          log.debug("API.getCompanyNews() RESOLVE");
          deferred.resolve(result);
        }).error( function(error) {
          log.error('API.getCompanyNews() REJECT');
          deferred.reject(error);
        });
        return deferred;
      }
    //--------------------------------------------------
    };
    
    return api;
});
