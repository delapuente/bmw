
(function (exports) {
  "use strict";

  var PROXY = 'http://crossorigin.me';

  var MANIFEST_NAME = 'manifest.appcache';

  var RESOURCES = {
    'libs/add2home/addtohomescreen.css': '_bmw/add2home/addtohomescreen.css',
    'libs/add2home/addtohomescreen.js' : '_bmw/add2home/addtohomescreen.js',
    'libs/add2home/init.js'            : '_bmw/add2home/init.js'
  };

  var bmw = exports.bmw = {

    getApp: function (user, repo, branch) {
      var downloadUrl = [
        'https://github.com', user, repo, 'archive', branch + '.zip'
      ].join('/');
      return fetch(PROXY + '/' + downloadUrl).then(function (response) {
        if (response.status >= 200 && response.status < 300) {
          return response.arrayBuffer();
        }
        throw new Error('Bad status: ' + response.status);
      });
    },

    processZip: function (zipdata) {
      var zip = new JSZip();
      zip.load(zipdata);

      var rootpath = '';
      var indexpath = 'index.html';
      var index = zip.file(indexpath);
      if (!index) {
        var root = zip.folder(/.+/)[0];
        if (!root) { return Promise.reject(new Error('No index.html')); }
        rootpath = root.name;
        indexpath = rootpath + 'index.html';
        index = zip.file(indexpath);
        if (!index) { return Promise.reject(new Error('No index.html')); }
      }

      var newIndex = this.processIndex(index.asText());
      var appcontents = this.getAppContents(zip, rootpath);
      var manifest = this.generateAppManifest(appcontents);

      zip.file(indexpath, newIndex);
      zip.file(rootpath + MANIFEST_NAME, manifest);

      var _this = this;
      return this.getResourceMap().then(function (resourceMap) {
        _this.addResourcesToZip(resourceMap, zip, rootpath);
        return Promise.resolve(zip.generate({ type: 'blob' }));
      });
    },

    getResourceMap: function () {
      var targets = [];
      var requests = [];
      Object.keys(RESOURCES).forEach(function (path) {
        var target = RESOURCES[path];
        var request = fetch(path);
        targets.push(target);
        requests.push(request);
      });
      return Promise.all(requests).then(function (responses) {
        var contents = responses.map(function (response) {
          return response.arrayBuffer();
        });
        return Promise.all(contents).then(function (blobs) {
          var target, content, map = {};
          for (var i = 0; i < blobs.length; i++) {
            target = targets[i];
            content = blobs[i];
            map[target] = content;
          }
          return Promise.resolve(map);
        });
      });
    },

    addResourcesToZip: function (resourceMap, zip, rootpath) {
      Object.keys(resourceMap).forEach(function (path) {
        zip.file(rootpath + path, resourceMap[path]);
      });
    },

    prepareToDownload: function (downloader, blob, name) {
      if (downloader.href) { URL.revokeObjectURL(downloader.href); }
      var url = URL.createObjectURL(blob);
      downloader.href = url;
      downloader.setAttribute('download', name);
    },

    downloadBlob: function (downloader, blob, name) {
      this.prepareToDownload(downloader, blob, name);
      downloader.click();
    },

    processIndex: function (indexcontent) {
      var muted = this.addManifestAttribute(indexcontent);
      muted = this.addResources(muted);
      return muted;
    },

    addManifestAttribute: function (content) {
      return content.replace(
        /(<\s*html)/i,
        '$1 manifest="' + MANIFEST_NAME +'"'
      );
    },

    addResources: function (content) {
      var refs = Object.keys(RESOURCES).map(function (path) {
        return RESOURCES[path];
      });
      var elements = refs.map(this.newElement.bind(this));
      return content.replace(
        /(<\s*head\s*>)/i,
        '$1\n' + elements.join('\n')
      );
    },

    newElement: function (src) {
      var tokens = src.split('.');
      var extension = tokens[tokens.length - 1];
      return {
        'js': this.newScript,
        'css': this.newStylesheet
      }[extension](src);
    },

    newScript: function (src) {
      var type = 'text/javascript';
      return '<script src="' + encodeURI(src) + '" ' +
             'type="' + type + '"></script>';
    },

    newStylesheet: function (src) {
      var type = 'text/css';
      return '<link href="' + encodeURI(src) + '" type="' + type + '" ' +
             'rel="stylesheet"/>';
    },

    getAppContents: function (zip, root) {
      var files = [];
      zip.filter(function (path, file) {
        if (!file.dir) {
          files.push(path.substr(root.length));
        }
      });
      return files;
    },

    generateAppManifest: function (contents, rootpath) {
      return [
        'CACHE MANIFEST',
        '# ' + new Date(),
        '',
        'CACHE:'
      ].concat(contents).concat([
        '',
        'NETWORK:',
        '*'
      ]).join('\n');
    }
  };

  var $ = document.querySelector.bind(document);
  var downloader = $('a');
  $('button').onclick = function () {
    var user = $('[data-name="user"]').textContent.trim();
    var repo = $('[data-name="repo"]').textContent.trim();
    var branch = $('[data-name="branch"]').textContent.trim();
    if (!user || !repo || !branch) {
      alert('User, repo and branch are mandatory!');
    }
    else {
      downloader.classList.remove('ready');
      bmw.getApp(user, repo, branch)
        .then(bmw.processZip.bind(bmw))
        .then(function (blob) {
          downloader.classList.add('ready');
          bmw.prepareToDownload(downloader, blob, branch + '.zip');
        })
        .catch(function (error) {
          alert('Something went wrong!');
          console.error(error);
        });
    }
  };

}(this))
