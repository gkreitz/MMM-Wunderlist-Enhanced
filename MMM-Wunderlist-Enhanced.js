"use strict";
/* global Module */

/* Magic Mirror
 * Module: MMM-Wunderlist-Enhanced
 * Adapted By: Dave Richer <davericher@gmail.com>
 * Inspired by MMM-Wunderlist Paul-Vincent Roll http://paulvincentroll.com
 * MIT Licensed.
 */

Module.register("MMM-Wunderlist-Enhanced", {

  defaults: {
    maximumEntries: 10,
    order: "normal",
    lists: ["inbox"],
    summarize: [],
    alwaysShowPattern: "",
    interval: 60,
    fade: true,
    fadePoint: 0.25,
    allBrightTitles: false,
    relativeDates: true,
    showDeadline: true,
    showAssignee: true,
    showBullets: false,
    // left, right, inline_left, inline_right, none
    iconPosition: "left",
    spaced: false
  },

  // Override socket notification handler.
  socketNotificationReceived: function(notification, payload) {
    switch (notification) {
      case 'TASKS':
        this.tasks = payload
        this.updateDom(3000);
        break;
      case 'STARTED':
        this.sendSocketNotification("addLists", this.config.lists);
        if (!this.config.showAssignee)
          break;
        this.started = true;
        this.sendSocketNotification("getUsers");
        break;
      case 'USERS':
        this.users = payload;
        if (this.tasks && this.tasks.length > 0)
          this.updateDom(3000);
        break;
    }
  },

  start: function() {
    this.tasks = [];
    this.sendSocketNotification("CONFIG", this.config);
    this.sendSocketNotification("CONNECTED");
    Log.info("Starting module: " + this.name);
  },

  getTodos: function(listName) {
    if(!this.tasks[listName])
      return [];

    let tasks = this.tasks[listName].slice();
    if (this.config.order === 'reversed') {
      tasks.reverse();
    }

    return tasks;
  },

  getScripts: function() {
    return ['String.format.js'];
  },
  getStyles: function() {
    return ['font-awesome.css', 'MMM-Wunderlist-Enhanced.css'];
  },

  html: {
    table: '<tbody>{0}</tbody>',
    titleRow: '<tr><th colspan="{0}"><header class="module-header"><i class="fa fa-list-ul fa-fw"></i> {1}</header></th></tr>',
    row: '<tr class="{0}">{1}</tr>',
    tdAssignee: '<td class="light">{0}</td>',
    tdDeadline: '<td class="light">{0}</td>',
    tdBullet: '<td>{0}</td>',
    tdContent: '<td class="title {0}">{1}</td>',
    star: '<i class="fa fa-star fa-fw" aria-hidden="true"></i>',
    bullet_left: '<i class="fa fa-chevron-right fa-fw" aria-hidden="true"></i>',
    bullet_right: '<i class="fa fa-chevron-left fa-fw" aria-hidden="true"></i>',
    bullet_none: '<i class="fa-fw" aria-hidden="true"></i>',
    assignee: '<div class="assignee">{0}</div>'
  },

  getTitleRow: function(title) {
    var columncount = 1;
    if (this.config.showAssignee) columncount += 1;
    if (this.config.showDeadline) columncount += 1;
    if (this.config.iconPosition != "inline") columncount += 1;
    return this.html.titleRow.format(columncount, title);
  },

  getBullet: function(starred) {
    if (starred)
      return this.html.star;

    if (!this.config.showBullets) 
      return this.html.bullet_none;

    if (this.config.iconPosition == "right" || this.config.iconPosition == "inline_right")
      return this.html.bullet_right;

    return this.html.bullet_left;
  },

  getRow: function(todo) {
    var self = this;
    var useTitle = todo.title;
    if (self.config.iconPosition == "inline_left") {
      useTitle = self.getBullet(todo.starred) + useTitle;
    } else if (self.config.iconPosition == "inline_right") {
      useTitle += self.getBullet(todo.starred);
    }
    var tds = self.html.tdContent.format(todo.starred || self.config.allBrightTitles ? 'bright' : 'normal', useTitle);

    if (self.config.iconPosition == "right" || self.config.iconPosition == "left") {
      var bulletTd = self.html.tdBullet.format(self.getBullet(todo.starred));
      if (self.config.iconPosition == "left") {
        tds = bulletTd + tds;
      } else {
        tds = tds + bulletTd; 
      }
    }

    if (self.config.showAssignee) {
      tds += self.html.tdAssignee.format(todo.assignee_id && self.users
        ? self.html.assignee.format(self.users[todo.assignee_id])
        : '');
    }

    if (self.config.showDeadline) {
      if (self.config.relativeDates && todo.due_date) {
        var now = moment();
        var todoDate = moment(todo.due_date);
        var relativeDate = '';

        if (todoDate.isSame(now, 'day')) {
          relativeDate = this.capFirst(this.translate("TODAY"));
        } else if (todoDate.isSame(moment().add(1, 'days'), 'day')) {
          relativeDate = this.capFirst(this.translate("TOMORROW"));
        } else {
          relativeDate = this.capFirst(moment(todoDate, "x").fromNow());
        }

        tds += self.html.tdDeadline.format(relativeDate);
      } else {
        tds += self.html.tdDeadline.format(todo.due_date
          ? todo.due_date
          : '');
      }
    }
    
    return self.html.row.format("", tds);
  },

  capFirst: function (string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  },

  getDom: function() {
    if (this.config.showAssignee) {
      this.sendSocketNotification("getUsers");
    }
    var self = this;
    var wrapper = document.createElement("table");
    wrapper.className = "normal small wunderlist";
    if (self.config.spaced) {
      wrapper.className += " spaced";
    }

    var results = [];

    this.config.lists.forEach(function(listName, _) {
      let todos = self.getTodos(listName)
      todos = todos.slice(0, self.config.maximumEntries);

      if (self.config.summarize.includes(listName)) {
        let len = self.tasks[listName] ? self.tasks[listName].length : 0;
        results.push(self.getTitleRow(listName + " (" + len + ")"));

        todos = todos.filter(function(todo) {
          if(todo.starred)
            return true;
          return self.config.alwaysShowPattern && todo.title.search(self.config.alwaysShowPattern) != -1;
        });
      } else {
        results.push(self.getTitleRow(listName));
      }

      todos.forEach(function(todo, i) {
        results.push(self.getRow(todo));
      });
    });
    wrapper.innerHTML = this.html.table.format(results.join(''))

    return wrapper;
  }
});
