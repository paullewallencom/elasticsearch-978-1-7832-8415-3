var searchApp = angular.module('searchApp', ['elasticsearch', 'ngSanitize']);

searchApp.controller('SearchResultsList', ['$scope', 'searchService', 'filterService', '$sce', function($scope, searchService, filterService, $sce) {

  $scope.searchTerms = null;
  $scope.noResults = false;
  $scope.isSearching = false;
  $scope.resultsPage = 0;

  $scope.results = {
    searchTerms: null,
    documentCount: null,
    documents: []
  };

  // Autocomplete
  $scope.autocomplete = {
    suggestions: []
  };
  $scope.showAutocomplete = false;

  $scope.evaluateTerms = function(event) {
    var inputTerms = $scope.searchTerms ? $scope.searchTerms.toLowerCase() : null;

    if (event.keyCode === 13) {
      return;
    }

    if (inputTerms && inputTerms.length > 3) {
      getSuggestions(inputTerms);
    }
    else if (!inputTerms) {
      $scope.autocomplete = {};
      $scope.showAutocomplete = false;
    }
  };

  $scope.searchForSuggestion = function() {
    $scope.searchTerms = $scope.autocomplete.suggestions[0].options[0].text;
    $scope.search();
    $scope.showAutocomplete = false;
  };

  var getSuggestions = function(query) {
    searchService.getSuggestions(query).then(function(es_return){
      var suggestions = es_return.suggest.phraseSuggestion;

      if (suggestions.length > 0) {
        $scope.autocomplete.suggestions = suggestions;
      }
      else {
        $scope.autocomplete.suggestions = [];
      }

      if (suggestions.length > 0) {
        $scope.showAutocomplete = true;
      }
      else {
        $scope.showAutocomplete = false; 
      }
    });
  };


  // Filters
  $scope.filters = filterService.filters;

  $scope.toggleFilter = function(field, value) {
    var selectedFilters = filterService.filters.selectedFilters,
        filterIndex = filterService.findSelectedFilter(field, value),
        thisFilter = {field: field, value: value};

    filterIndex > -1 ? selectedFilters.splice(filterIndex, 1) : selectedFilters.push(thisFilter);

    resetResults();
    getResults();
  };

  // Sort
  $scope.sortOptions = [
    {name: '_score', displayName: 'Relevancy', direction: 'desc'},
    {name: 'price_gbp', displayName: 'Price', direction: 'asc'}
  ];

  $scope.selectedSort = $scope.sortOptions[0];

  $scope.updateSort = function() {
    resetResults();
    getResults();
  }

  // Results
  var resetResults = function() {
    $scope.results.documents = [];
    $scope.results.documentCount = null;

    $scope.resultsPage = 0;

    $scope.noResults = false;
  };

  $scope.search = function() {
    resetResults();
    $scope.filters.selectedFilters = [];

    var searchTerms = $scope.searchTerms;

    if (searchTerms) {
      $scope.results.searchTerms = searchTerms;
    } else {
      return;
    }

    getResults();
  };

  $scope.getNextPage = function() {
    $scope.resultsPage++;
    getResults();
  };

  $scope.$watchGroup(['results', 'noResults', 'isSearching'], function() {
    var documentCount = $scope.results.documentCount;

    if (!documentCount || documentCount <= $scope.results.documents.length || $scope.noResults || $scope.isSearching) {
      $scope.canGetNextPage = false;
    } 
    else {
      $scope.canGetNextPage = true;
    }
  });

  var getResults = function() {
    $scope.isSearching = true;

    searchService.search( $scope.results.searchTerms, 
                          $scope.resultsPage,
                          $scope.selectedSort,
                          filterService.filters.selectedFilters)
    .then(function(es_return) {
      var totalHits = es_return.hits.total;

      if (totalHits > 0) {
          $scope.results.documentCount = totalHits;
          $scope.results.documents.push.apply($scope.results.documents, searchService.formatResults(es_return.hits.hits));
          filterService.formatFilters(es_return.aggregations);
      }
      else {
        $scope.noResults = true;
      }

      $scope.isSearching = false;
      
    }, 
    function(error) {
      console.log('ERROR: ', error.message);
      $scope.isSearching = false;
    });
  };
}]);

searchApp.service('searchService', ['$q', 'esFactory', 'filterService', function($q, esFactory, filterService) {
  var esClient = esFactory({
    location: 'localhost:9200'
  });

  this.setQuery = function(searchTerms, selectedFilters) {
    var selectedFilters = filterService.filters.selectedFilters;

    var query = {match: {_all: searchTerms}};

    var filteredQuery = {
      filtered: {
        query: query,
        filter: {
          bool: {
            must: []
          }
        }
      }
    };

    if (selectedFilters.length > 0) {
      selectedFilters.forEach(function (filter, key) {
        var obj = {term: {}};
        obj.term["topics.full"] = filter.value;

        filteredQuery.filtered.filter.bool.must.push(obj);
      });
    }

    return selectedFilters.length > 0 ? filteredQuery : query;
  };

  this.search = function(searchTerms, resultsPage, selectedSort, selectedFilters) {
    var deferred = $q.defer();

    var sortObject = {};
    sortObject[selectedSort.name] = selectedSort.direction;

    esClient.search({
      index: 'library',
      body: {
        query: this.setQuery(searchTerms, selectedFilters),
        sort: [sortObject],
        from: resultsPage * 10,
        aggs: {
          topics: {
            terms: {field: "topics.full"}
          }
        },
        highlight: {
          fields: {
            "title": {number_of_fragments: 0},
            "detailed description": {number_of_fragments: 0}
          }
        }
      }
    }).then(function(es_return) {
      deferred.resolve(es_return);
    }, function(error) {
      deferred.reject(error);
    });

    return deferred.promise;
  };

  this.formatResults = function(documents) {
    var formattedResults = [];

    documents.forEach(function(document) {
      var documentSource = document._source;

      angular.forEach(documentSource, function(value, field) {
        var highlights = document.highlight || {};
        var highlight = highlights[field] || false;

        if (highlight) {
          documentSource[field] = highlight[0];
        }
      });

      formattedResults.push(documentSource);
    });

    return formattedResults;
  };

  this.getSuggestions = function(query) {
    var deferred = $q.defer();

    
    
    esClient.search({
      index: 'library',
      body: {
        "suggest": {
          "text": query,
          "phraseSuggestion": {
            "phrase": {
              "field": "title.basic",
              "direct_generator": [{
                "field": "title.basic",
                "suggest_mode": "popular",
                "min_word_length": 3,
                "prefix_length": 2
              }]
            }
          }
        },
        "size": 0
      }
    }).then(function(es_return) {
      deferred.resolve(es_return);
    }, function(error) {
      deferred.reject(error);
    });

    return deferred.promise;
  };
}]);

searchApp.service('filterService', [function() {
  this.filters = {
    availableFilters: {},
    selectedFilters: []
  };

  this.findSelectedFilter = function(field, value) {
    var selectedFilters = this.filters.selectedFilters;

    for (var i=0; i<selectedFilters.length; i++) {
      var obj = selectedFilters[i];
      if (obj.field == field && obj.value == value) {
        return i;
      }
    }
    return -1;
  };

  this.formatFilters = function(aggregations) {
    var self = this;
    var formattedFilters = {};

    for (var aggregation in aggregations) {
      if(aggregations.hasOwnProperty(aggregation)) {
        var filters = aggregations[aggregation].buckets.map(function(obj) {
          var isSelected = function() {
            return self.findSelectedFilter(aggregation, obj.key) == -1 ? false : true;
          };

          return {
            value: obj.key,
            count: obj.doc_count,
            isSelected: isSelected()
          }
        });

        formattedFilters[aggregation] = filters;
      }
    }
    this.filters.availableFilters = formattedFilters;
  };

}]);