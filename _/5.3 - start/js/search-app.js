var searchApp = angular.module('searchApp', ['elasticsearch', 'ngSanitize']);

searchApp.controller('SearchResultsList', ['$scope', 'searchService', '$sce', function($scope, searchService, $sce) {

  $scope.searchTerms = null;
  $scope.noResults = false;
  $scope.isSearching = false;
  $scope.resultsPage = 0;

  $scope.results = {
    searchTerms: null,
    documentCount: null,
    documents: []
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
                          $scope.selectedSort)
    .then(function(es_return) {
      var totalHits = es_return.hits.total;

      if (totalHits > 0) {
          $scope.results.documentCount = totalHits;
          $scope.results.documents.push.apply($scope.results.documents, searchService.formatResults(es_return.hits.hits));
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

searchApp.service('searchService', ['$q', 'esFactory', function($q, esFactory) {
  var esClient = esFactory({
    location: 'localhost:9200'
  });

  this.search = function(searchTerms, resultsPage, selectedSort) {
    var deferred = $q.defer();

    var sortObject = {};
    sortObject[selectedSort.name] = selectedSort.direction;

    esClient.search({
      index: 'library',
      body: {
        query: {
          match: {
            _all: searchTerms
          }
        },
        sort: [sortObject],
        from: resultsPage * 10,
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
}]);