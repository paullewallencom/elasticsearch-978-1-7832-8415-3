var searchApp = angular.module('searchApp', ['elasticsearch']);

searchApp.controller('SearchResultsList', ['$scope', function($scope){
  $scope.hello = "Hello World!"; 
}]);