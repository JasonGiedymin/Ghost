/*globals describe, beforeEach, afterEach,  before, it*/
var fs           = require('fs'),
    path         = require('path'),
    EventEmitter = require('events').EventEmitter,
    should       = require('should'),
    sinon        = require('sinon'),
    _            = require('lodash'),
    when         = require('when'),
    helpers      = require('../../server/helpers'),
    filters      = require('../../server/filters'),

    // Stuff we are testing
    appProxy   = require('../../server/apps/proxy'),
    AppSandbox = require('../../server/apps/sandbox'),
    AppDependencies = require('../../server/apps/dependencies'),
    AppPermissions = require('../../server/apps/permissions');

describe('Apps', function () {

    var sandbox,
        fakeApi;

    beforeEach(function () {
        sandbox = sinon.sandbox.create();

        fakeApi = {
            posts: {
                browse: sandbox.stub(),
                read: sandbox.stub(),
                edit: sandbox.stub(),
                add: sandbox.stub(),
                destroy: sandbox.stub()
            },
            users: {
                browse: sandbox.stub(),
                read: sandbox.stub(),
                edit: sandbox.stub()
            },
            tags: {
                all: sandbox.stub()
            },
            notifications: {
                destroy: sandbox.stub(),
                add: sandbox.stub()
            },
            settings: {
                browse: sandbox.stub(),
                read: sandbox.stub(),
                add: sandbox.stub()
            }
        };
    });

    afterEach(function () {
        sandbox.restore();
    });

    describe('Proxy', function () {
        it('creates a ghost proxy', function () {
            should.exist(appProxy.filters);
            should.exist(appProxy.filters.register);
            should.exist(appProxy.filters.deregister);

            should.exist(appProxy.helpers);
            should.exist(appProxy.helpers.register);
            should.exist(appProxy.helpers.registerAsync);

            should.exist(appProxy.api);

            should.exist(appProxy.api.posts);
            should.not.exist(appProxy.api.posts.edit);
            should.not.exist(appProxy.api.posts.add);
            should.not.exist(appProxy.api.posts.destroy);

            should.not.exist(appProxy.api.users);

            should.exist(appProxy.api.tags);

            should.exist(appProxy.api.notifications);
            should.not.exist(appProxy.api.notifications.destroy);

            should.exist(appProxy.api.settings);
            should.not.exist(appProxy.api.settings.browse);
            should.not.exist(appProxy.api.settings.add);
        });
    });

    describe('Sandbox', function () {
        it('loads apps in a sandbox', function () {
            var appBox = new AppSandbox(),
                appPath = path.resolve(__dirname, '..', 'utils', 'fixtures', 'app', 'good.js'),
                GoodApp,
                app;

            GoodApp = appBox.loadApp(appPath);

            should.exist(GoodApp);

            app = new GoodApp(appProxy);

            app.install(appProxy);

            app.app.something.should.equal(42);
            app.app.util.util().should.equal(42);
            app.app.nested.other.should.equal(42);
            app.app.path.should.equal(appPath);
        });

        it('does not allow apps to require blacklisted modules at top level', function () {
            var appBox = new AppSandbox(),
                badAppPath = path.join(__dirname, '..', 'utils', 'fixtures', 'app', 'badtop.js'),
                BadApp,
                app,
                loadApp = function () {
                    appBox.loadApp(badAppPath);
                };

            loadApp.should.throw('Unsafe App require: knex');
        });

        it('does not allow apps to require blacklisted modules at install', function () {
            var appBox = new AppSandbox(),
                badAppPath = path.join(__dirname, '..', 'utils', 'fixtures', 'app', 'badinstall.js'),
                BadApp,
                app,
                installApp = function () {
                    app.install(appProxy);
                };

            BadApp = appBox.loadApp(badAppPath);

            app = new BadApp(appProxy);

            installApp.should.throw('Unsafe App require: knex');
        });

        it('does not allow apps to require blacklisted modules from other requires', function () {
            var appBox = new AppSandbox(),
                badAppPath = path.join(__dirname, '..', 'utils', 'fixtures', 'app', 'badrequire.js'),
                BadApp,
                app,
                loadApp = function () {
                    BadApp = appBox.loadApp(badAppPath);
                };

            loadApp.should.throw('Unsafe App require: knex');
        });

        it('does not allow apps to require modules relatively outside their directory', function () {
            var appBox = new AppSandbox(),
                badAppPath = path.join(__dirname, '..', 'utils', 'fixtures', 'app', 'badoutside.js'),
                BadApp,
                app,
                loadApp = function () {
                    BadApp = appBox.loadApp(badAppPath);
                };

            loadApp.should.throw(/^Unsafe App require[\w\W]*example$/);
        });
    });

    describe('Dependencies', function () {
        it('can install by package.json', function (done) {
            var deps = new AppDependencies(process.cwd()),
                fakeEmitter = new EventEmitter();

            deps.spawnCommand = sandbox.stub().returns(fakeEmitter);

            deps.install().then(function () {
                deps.spawnCommand.calledWith('npm').should.equal(true);
                done();
            }).otherwise(done);

            _.delay(function () {
                fakeEmitter.emit('exit');
            }, 30);
        });
        it('does not install when no package.json', function (done) {
            var deps = new AppDependencies(__dirname),
                fakeEmitter = new EventEmitter();

            deps.spawnCommand = sandbox.stub().returns(fakeEmitter);

            deps.install().then(function () {
                deps.spawnCommand.called.should.equal(false);
                done();
            }).otherwise(done);

            _.defer(function () {
                fakeEmitter.emit('exit');
            });
        });
    });

    describe('Permissions', function () {
        var noGhostPackageJson = {
                "name": "myapp",
                "version": "0.0.1",
                "description": "My example app",
                "main": "index.js",
                "scripts": {
                    "test": "echo \"Error: no test specified\" && exit 1"
                },
                "author": "Ghost",
                "license": "MIT",
                "dependencies": {
                    "ghost-app": "0.0.1"
                }
            },
            validGhostPackageJson = {
                "name": "myapp",
                "version": "0.0.1",
                "description": "My example app",
                "main": "index.js",
                "scripts": {
                    "test": "echo \"Error: no test specified\" && exit 1"
                },
                "author": "Ghost",
                "license": "MIT",
                "dependencies": {
                    "ghost-app": "0.0.1"
                },
                "ghost": {
                    "permissions": {
                        "posts": ["browse", "read", "edit", "add", "delete"],
                        "users": ["browse", "read", "edit", "add", "delete"],
                        "settings": ["browse", "read", "edit", "add", "delete"]
                    }
                }
            };

        it('has default permissions to read and browse posts', function () {
            should.exist(AppPermissions.DefaultPermissions);

            should.exist(AppPermissions.DefaultPermissions.posts);

            AppPermissions.DefaultPermissions.posts.should.contain('browse');
            AppPermissions.DefaultPermissions.posts.should.contain('read');

            // Make it hurt to add more so additional checks are added here
            _.keys(AppPermissions.DefaultPermissions).length.should.equal(1);
        });
        it('uses default permissions if no package.json', function (done) {
            var perms = new AppPermissions("test");

            // No package.json in this directory
            sandbox.stub(perms, "checkPackageContentsExists").returns(when.resolve(false));

            perms.read().then(function (readPerms) {
                should.exist(readPerms);

                readPerms.should.equal(AppPermissions.DefaultPermissions);

                done();
            }).otherwise(done);
        });
        it('uses default permissions if no ghost object in package.json', function (done) {
            var perms = new AppPermissions("test"),
                noGhostPackageJsonContents = JSON.stringify(noGhostPackageJson, null, 2);

            // package.json IS in this directory
            sandbox.stub(perms, "checkPackageContentsExists").returns(when.resolve(true));
            // no ghost property on package
            sandbox.stub(perms, "getPackageContents").returns(when.resolve(noGhostPackageJsonContents));

            perms.read().then(function (readPerms) {
                should.exist(readPerms);

                readPerms.should.equal(AppPermissions.DefaultPermissions);

                done();
            }).otherwise(done);
        });
        it('rejects when reading malformed package.json', function (done) {
            var perms = new AppPermissions("test");

            // package.json IS in this directory
            sandbox.stub(perms, "checkPackageContentsExists").returns(when.resolve(true));
            // malformed JSON on package
            sandbox.stub(perms, "getPackageContents").returns(when.reject(new Error('package.json file is malformed')));

            perms.read().then(function (readPerms) {
                done(new Error('should not resolve'));
            }).otherwise(function () {
                done();
            });
        });
        it('reads from package.json in root of app directory', function (done) {
            var perms = new AppPermissions("test"),
                validGhostPackageJsonContents = validGhostPackageJson;

            // package.json IS in this directory
            sandbox.stub(perms, "checkPackageContentsExists").returns(when.resolve(true));
            // valid ghost property on package
            sandbox.stub(perms, "getPackageContents").returns(when.resolve(validGhostPackageJsonContents));

            perms.read().then(function (readPerms) {
                should.exist(readPerms);

                readPerms.should.not.equal(AppPermissions.DefaultPermissions);

                should.exist(readPerms.posts);
                readPerms.posts.length.should.equal(5);

                should.exist(readPerms.users);
                readPerms.users.length.should.equal(5);

                should.exist(readPerms.settings);
                readPerms.settings.length.should.equal(5);

                _.keys(readPerms).length.should.equal(3);

                done();
            }).otherwise(done);
        });
    });
});
