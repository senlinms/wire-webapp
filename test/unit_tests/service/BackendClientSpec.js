/*
 * Wire
 * Copyright (C) 2017 Wire Swiss GmbH
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see http://www.gnu.org/licenses/.
 *
 */

// grunt test_init && grunt test_run:service/Client

'use strict';

describe('z.service.BackendClient', function() {
  let backend_client = null;
  let server = null;

  const urls = {
    rest_url: 'http://localhost',
    websocket_url: 'wss://localhost',
  };

  beforeEach(function() {
    backend_client = new z.service.BackendClient(urls);
    backend_client.logger.level = backend_client.logger.levels.ERROR;
  });

  afterEach(function() {
    backend_client = null;
  });

  describe('execute_on_connectivity', function() {
    beforeEach(function() {
      jasmine.clock().install();
      server = sinon.fakeServer.create();
      spyOn(backend_client, 'status').and.callThrough();
    });

    afterEach(function() {
      jasmine.clock().uninstall();
      server.restore();
    });

    it('executes callback when backend status is ok', function(done) {
      backend_client.execute_on_connectivity()
        .then(function() {
          expect(backend_client.status).toHaveBeenCalled();
          expect(backend_client.status).toHaveBeenCalledTimes(1);
          done();
        })
        .catch(done.fail);

      jasmine.clock().tick(10);
      server.requests[0].respond(200);
    });

    it('executes callback when backend status return an error', function(done) {
      backend_client.execute_on_connectivity()
        .then(function() {
          expect(backend_client.status).toHaveBeenCalled();
          expect(backend_client.status).toHaveBeenCalledTimes(1);
          done();
        })
        .catch(done.fail);

      jasmine.clock().tick(10);
      server.requests[0].respond(401);
    });

    it('does not execute callback when request times out', function(done) {
      backend_client.execute_on_connectivity()
        .then((response) => done.fail(response))
        .catch(done.fail);

      jasmine.clock().tick(250);
      expect(backend_client.status).toHaveBeenCalled();
      expect(backend_client.status).toHaveBeenCalledTimes(1);
      jasmine.clock().tick(2500);
      expect(backend_client.status).toHaveBeenCalledTimes(2);
      done();
    });

    it('executes callback when it retries after failure', function(done) {
      backend_client.execute_on_connectivity()
        .then(function() {
          expect(backend_client.status).toHaveBeenCalledTimes(2);
          done();
        })
        .catch(done.fail);

      jasmine.clock().tick(500);
      expect(backend_client.status).toHaveBeenCalled();
      expect(backend_client.status).toHaveBeenCalledTimes(1);
      jasmine.clock().tick(2100);
      expect(backend_client.status).toHaveBeenCalledTimes(2);
      server.requests[1].respond(401);
    });

    it('does not execute the callback when it retries after failure and fails again', function(done) {
      backend_client.execute_on_connectivity()
        .then((response) => done.fail(response))
        .catch(done.fail);

      jasmine.clock().tick(750);
      expect(backend_client.status).toHaveBeenCalled();
      jasmine.clock().tick(2500);
      expect(backend_client.status).toHaveBeenCalledTimes(2);
      return done();
    });
  });

  describe('_send_request', function() {
    let config = undefined;
    const url = 'http://localhost/user';

    beforeAll(function() {
      config = {
        timeout: 100,
        type: 'GET',
        url: url,
      };
    });

    beforeEach(function() {
      backend_client.request_queue.pause();
      jasmine.clock().install();
      server = sinon.fakeServer.create();
    });

    afterEach(function() {
      jasmine.clock().uninstall();
      server.restore();
    });

    it('should resolve with the request payload', function(done) {
      backend_client._send_request(config)
        .then(done)
        .catch(done.fail);
      server.requests[0].respond(200);
    });

    it('should cache the request if it was unauthorized', function(done) {
      const token_refresh = jasmine.createSpy('token_refresh');
      amplify.subscribe(z.event.WebApp.CONNECTION.ACCESS_TOKEN.RENEW, token_refresh);

      backend_client._send_request(config)
        .then((response) => done.fail(response))
        .catch(done.fail);
      server.requests[0].respond(401);

      jasmine.clock().tick(750);
      expect(backend_client.request_queue.get_length()).toBe(1);
      expect(token_refresh).toHaveBeenCalled();
      done();
    });

    it('should cache the request if it timed out', function(done) {
      spyOn(backend_client, 'execute_on_connectivity').and.returnValue(Promise.resolve());

      backend_client._send_request(config)
        .then((response) => done.fail(response))
        .catch(done.fail);

      jasmine.clock().tick(150);
      expect(backend_client.request_queue.get_length()).toBe(1);
      expect(backend_client.execute_on_connectivity).toHaveBeenCalled();
      done();
    });
  });

  describe('send_json', function() {
    let original_config = undefined;

    beforeEach(function() {
      original_config = {
        data: 'data',
        headers: {
          'X-TEST-HEADER': 'header',
        },
        processData: true,
        timeout: 100,
        type: 'GET',
        url: 'dummy/url',
        withCredentials: true,
      };
    });

    it('passes all params to send_request', function(done) {
      spyOn(backend_client, 'send_request').and.callFake(function(config) {
        expect(config.callback).toBe(original_config.callback);
        expect(config.contentType).toBe('application/json; charset=utf-8');
        expect(config.headers['X-TEST-HEADER']).toBe(original_config.headers['X-TEST-HEADER']);
        expect(config.headers['Content-Encoding']).toBe('gzip');
        expect(config.data).toBeDefined();
        expect(config.processData).toBe(original_config.processData);
        expect(config.timeout).toBe(original_config.timeout);
        expect(config.type).toBe(original_config.type);
        expect(config.url).toBe(original_config.url);
        expect(config.withCredentials).toBe(original_config.withCredentials);
        done();
      });

      backend_client.send_json(original_config);
    });
  });
});
