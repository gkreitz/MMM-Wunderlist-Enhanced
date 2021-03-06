"use strict";

/* Magic Mirror
 * Module: MMM-Wunderlist
 *
 * By Paul-Vincent Roll http://paulvincentroll.com
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");
const Fetcher = require("./fetcher.js");
var WunderlistSDK = require('wunderlist');
var moment = require('moment');

module.exports = NodeHelper.create({
  start: function() {
    this.config = [];
    this.fetchers = {};
    this.started = false;
  },

  getLists: function(callback) {
    this.WunderlistAPI.http.lists.all().done(function(lists) {
      callback(lists);
    }).fail(function(resp, code) {
      console.error('there was a Wunderlist problem', code);
    });
  },

  getUsers: function(callback) {
    this.WunderlistAPI.http.users.all().done(function(users) {
      var ret = {};
      users.forEach(function(user) {
        ret[user.id] = user.name ? user.name[0] : user.email[0];
      });
      callback(ret);
    }).fail(function(resp, code) {
      console.error('there was a Wunderlist problem', code);
    })
  },

  createFetcher: function(listID, list, reloadInterval) {

    var fetcher;

    if (typeof this.fetchers[listID] === "undefined") {

      var self = this;

      console.log("Create new todo fetcher for list: " + list + " - Interval: " + reloadInterval);
      fetcher = new Fetcher(listID, list, reloadInterval, this.config.accessToken, this.config.clientID, this.config.showAssignee);

      fetcher.onReceive(function(fetcher) {
        self.broadcastTodos();
      });

      fetcher.onError(function(fetcher, error) {
        self.sendSocketNotification("FETCH_ERROR", {
          url: fetcher.id(),
          error: error
        });
      });

      this.fetchers[listID] = {
        "name": list,
        "instance": fetcher
      };
    } else {
      console.log("Use exsisting todo fetcher for list: " + list);
      fetcher = this.fetchers[listID].instance;
      fetcher.setReloadInterval(reloadInterval);
      fetcher.broadcastItems();
    }

    fetcher.startFetch();
  },

  broadcastTodos: function() {
    var todos = {};
    for (var f in this.fetchers) {
      todos[this.fetchers[f].name] = this.fetchers[f].instance.items();
    }
    this.sendSocketNotification("TASKS", todos);
  },

  // Subclass socketNotificationReceived received.
  socketNotificationReceived: function(notification, payload) {
    const self = this;
    switch (notification) {
      case 'CONFIG':
        // We are already configured
        if (this.started)
          break;

        // Grab Initial payload
        this.config = payload;

        // Create wunderlist API and fetch lists
        this.WunderlistAPI = new WunderlistSDK({accessToken: self.config.accessToken, clientID: self.config.clientID});
        // Wait Until initialized
        this.WunderlistAPI.initialized.done(function() {
          // Get Initial List
          self.getLists(function(data) {
            self.lists = data;
            self.sendSocketNotification("STARTED");
          });

          self.started = true;
        });

        break;
      case 'addLists':
        self.lists.forEach(function(currentValue, key) {
          if (self.config.lists.indexOf(currentValue.title) >= 0) {
            self.createFetcher(currentValue.id, currentValue.title, self.config.interval * 1000);
          }
        });
        break;
      case 'CONNECTED':
        self.broadcastTodos();
        break;
      case 'getUsers':
        self.getUsers(function(data) {
          self.sendSocketNotification('USERS', data)
        });
        break;
    }
  }

});
