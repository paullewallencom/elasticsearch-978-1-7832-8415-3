var searchApp = angular.module('searchApp', ['elasticsearch']);

searchApp.controller('SearchResultsList', ['$scope', 'searchService', function($scope, searchService) {
  $scope.results = {
    documents: []
  };

  searchService.search().then(function(es_return) {
    $scope.results.documents = searchService.formatResults(es_return.hits.hits);
  })

}]);

searchApp.service('searchService', ['$q', 'esFactory', function($q, esFactory) {
  var esClient = esFactory({
    location: 'localhost:9200'
  });

  this.search = function() {
    var deferred = $q.defer();

    esClient.search({
      index: 'library',
      body: {
        query: {
          match_all: {}
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
      formattedResults.push(document._source)
    });

    return formattedResults;
  };
}]);