/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright 2016 Joyent, Inc.
 */

var mod_events = require('events');
var mod_util = require('util');

var mod_assert = require('assert-plus');

var lib_common = require('./common');

function
InflightRegister()
{
	this.ir_inflights = [];
}

InflightRegister.prototype.broadcast = function
broadcast(evt_name, arg0, arg1, arg2)
{
	for (var i = 0; i < this.ir_inflights.length; i++) {
		this.ir_inflights[i].emit(evt_name, arg0, arg1, arg2);
	}
};

InflightRegister.prototype.lookup = function
lookup(id)
{
	for (var i = 0; i < this.ir_inflights.length; i++) {
		if (this.ir_inflights[i].if_id === id)
			return (this.ir_inflights[i]);
	}
	return (null);
};

InflightRegister.prototype._remove = function
_remove(id)
{
	for (var i = 0; i < this.ir_inflights.length; i++) {
		if (this.ir_inflights[i].if_id === id) {
			this.ir_inflights.splice(i, 1);
			return;
		}
	}
	throw (new Error('inflight ' + id + ' not in inflight list'));
};

InflightRegister.prototype.register = function
register(data)
{
	for (;;) {
		var id = lib_common.request_id();
		var exist = this.lookup(id);
		if (exist)
			continue;

		var infl = new Inflight(this, id, data);
		this.ir_inflights.push(infl);
		return (infl);
	}
};

InflightRegister.prototype.dump_ids = function
dump_ids()
{
	return (this.ir_inflights.map(function (_if) {
		return (_if.if_id);
	}));
};

InflightRegister.prototype.dump_one = function
dump_one(id)
{
	var infl = this.lookup(id);
	if (!infl)
		return (null);

	var data_str = '<missing toString()>';
	if (infl.if_data && typeof (infl.if_data.toString) === 'function') {
		try {
			data_str = infl.if_data.toString();
		} catch (err) {
			data_str = 'ERROR: ' + err.message;
		}
	}

	var now = Date.now();
	return ({
		id: infl.if_id,
		create_time: infl.if_ctime,
		age: now - infl.if_ctime,
		data: data_str
	});
};

function
Inflight(register, id, data)
{
	mod_assert.object(register);
	mod_assert.string(id);
	mod_assert.ok(data);

	this.if_register = register;
	this.if_id = id;
	this.if_data = data;

	this.if_ctime = Date.now();

	this.if_complete = false;

	this.if_timeout = null;
	this.if_timeout_times = [];

	mod_events.EventEmitter.call(this);
}
mod_util.inherits(Inflight, mod_events.EventEmitter);

Inflight.prototype.id = function
id()
{
	return (this.if_id);
};

Inflight.prototype._fire_timeout = function
_fire_timeout()
{
	mod_assert.strictEqual(this.if_complete, false,
	    'inflight complete and yet timeout fired anyway');

	this.if_timeout = null;
	this.if_timeout_times.push(Date.now());

	this.emit('timeout');
};

Inflight.prototype.is_complete = function
is_complete()
{
	return (this.if_complete);
};

Inflight.prototype.complete = function
complete()
{
	mod_assert.strictEqual(this.if_complete, false,
	    'inflight complete already');

	this.cancel_timeout();

	this.if_complete = true;
	this.if_register._remove(this.if_id);

	this.emit.apply(this, [ 'complete' ].concat(arguments));
};

Inflight.prototype.data = function
data()
{
	return (this.if_data);
};

Inflight.prototype.start_timeout = function
start_timeout(time_ms)
{
	mod_assert.strictEqual(this.if_complete, false,
	    'timeout start after inflight complete');

	this.cancel_timeout();
	this.if_timeout = setTimeout(this._fire_timeout.bind(this), time_ms);
};

Inflight.prototype.cancel_timeout = function
cancel_timeout()
{
	if (this.if_timeout !== null) {
		clearTimeout(this.if_timeout);
		this.if_timeout = null;
	}
};

module.exports = {
	InflightRegister: InflightRegister
};

/* vim: set ts=8 sts=8 sw=8 noet: */
