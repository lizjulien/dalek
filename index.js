/*!
 *
 * Copyright (c) 2013 Sebastian Golasch
 *
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"),
 * to deal in the Software without restriction, including without limitation
 * the rights to use, copy, modify, merge, publish, distribute, sublicense,
 * and/or sell copies of the Software, and to permit persons to whom the
 * Software is furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
 * OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
 * THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
 * DEALINGS IN THE SOFTWARE.
 *
 */

'use strict';

// ext. libs
var _ = require('lodash');
var async = require('async');
var EventEmitter2 = require('eventemitter2').EventEmitter2;

// int. libs
var clients = require('./lib/clients')();
var driver = require('./lib/driver')();
var reporter = require('./lib/reporter')();
var timer = require('./lib/timer')();
var Config = require('./lib/config');

/**
 * @module
 */

module.exports = function (opts) {
    return new Dalek(opts);
};

/**
 * Default options
 * @type {Object}
 */

var defaults = {
    reporter: ['console'],
    driver: ['native'],
    browser: ['phantomjs'],
    logLevel: 1
};

/**
 * @constructor
 */

function Dalek (opts) {
  // check for given options, set defaults if option is not given
  if (!_.isArray(opts.reporter) || opts.reporter.length === 0) opts.reporter = defaults.reporter;
  if (!_.isArray(opts.driver) || opts.driver.length === 0) opts.driver = defaults.driver;
  if (!_.isArray(opts.browser) || opts.browser.length === 0) opts.browser = defaults.browser;
  if (!opts.logLevel) opts.logLevel = defaults.logLevel;

  // prepare error data
  this.warnings = [];

  // normalize options
  this.options = this.normalizeOptions(opts);

  // prepare state data for the complete test run
  this.runnerStatus = true;
  this.assertionsFailed = 0;
  this.assertionsPassed = 0;

  // initiate config
  this.config = Config(opts);

  // check for file option, throw error if none is given
  if (!_.isArray(this.config.get('tests'))) throw 'No test files given';

  // prepare and load reporter(s)
  this.reporters = [];
  this.reporterEvents = new EventEmitter2();
  this.options.reporter = this.config.verifyReporters(this.options.reporter, reporter);
  this.options.reporter.forEach(function (mod) {
    this.reporters.push(reporter.loadReporter(mod, {events: this.reporterEvents, logLevel: opts.logLevel}));
  }.bind(this));

  // count all passed & failed assertions
  this.reporterEvents.on('report:assertion', function (assertion) {
    if (assertion.success) {
      this.assertionsPassed++;
    } else {
      this.runnerStatus = false;
      this.assertionsFailed++;
    }
  }.bind(this));

  // prepare and load driver
  this.options.driver = this.config.verifyDrivers(this.options.driver, driver);
};

/**
 *
 */

Dalek.prototype.run = function () {
  // prepare
  var driverEmitter = new EventEmitter2();
  driverEmitter.setMaxListeners(1000);
  this.driverEmitter = driverEmitter;
  driver.browser = this.options.browser;
  driver.files = this.config.get('tests');
  driver.driverEmitter = driverEmitter;
  driver.reporterEvents = this.reporterEvents;
  driver.drivers = this.options.driver;

  // start the timer to measure the execution time
  timer.start();

  // emit the runner started event
  this.reporterEvents.emit('report:runner:started');

  // execute all given drivers sequentially
  var drivers = driver.getDrivers();
  async.series(drivers, this.testsuitesFinished.bind(this));
};

/**
 *
 */

Dalek.prototype.testsuitesFinished = function (err, results) {
  this.driverEmitter.emit('tests:complete');
  setTimeout(this.reportRunFinished.bind(this), 0);
  return this;
};

/**
 *
 */

Dalek.prototype.reportRunFinished = function () {
  this.reporterEvents.emit('report:runner:finished', {
    elapsedTime: timer.stop().getElapsedTimeFormatted(),
    assertions: this.assertionsFailed + this.assertionsPassed,
    assertionsFailed: this.assertionsFailed,
    assertionsPassed: this.assertionsPassed,
    status: this.runnerStatus
  });
};

/**
 * Normalizes options
 * @param  {[type]} options [description]
 * @return {[type]}         [description]
 */

Dalek.prototype.normalizeOptions = function (options) {
  _(options).forEach(function (val, key) {
    if ({reporter: 1, driver: 1}[key]) {
      options[key] = _.map(val, function (input) { return input.trim(); });
    }
  });

  return options;
};

/**
 *
 */

Dalek.prototype.setWarning = function (type, message, code, value) {
  this.warnings.push({type: type, message: message, code: code, value: value});
  return this;
};