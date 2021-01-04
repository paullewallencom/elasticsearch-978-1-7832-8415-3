var searchApp = angular.module('searchApp', ['elasticsearch']);

searchApp.controller('SearchResultsList', ['$scope', 'searchService', function($scope, searchService) {

  $scope.searchTerms = null;
  $scope.noResults = false;
  $scope.isSearching = false;
  $scope.resultsPage = 0;

  $scope.results = {
    searchTerms: null,
    documentCount: null,
    documents: []
  };

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

    searchService.search($scope.results.searchTerms, $scope.resultsPage).then(function(es_return) {
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

  this.search = function(searchTerms, resultsPage) {
    var deferred = $q.defer();

    esClient.search({
      index: 'library',
      body: {
        query: {
          match: {
            _all: searchTerms
          }
        },
        from: resultsPage * 10
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
      formattedResults.push(document._source)
    });

    return formattedResults;
  };
}]);