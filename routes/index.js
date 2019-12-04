const express = require('express');
const router = express.Router();
const fs = require('fs');
const {exec, execSync} = require('child_process');
const path = require('path');
const shortid = require('shortid');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const adapter = new FileSync('db.json');
const db = low(adapter);
db.defaults({sites: [], users: []}).write();


/* GET home page. */
router.get('/', function (req, res, next) {
    res.render('index');
});

router.get('/getSites', function (req, res, next) {
    let sites = db.get('sites').value();
    res.send(sites);
});

router.post('/createSite', (req, res, next) => {

    const {domain, publicPath} = req.body;

    if (!domain || !publicPath) {
        res.render('index', {error: "Domain or public path are not defined"});
        return;
    }

    const NGINX_SITES_AVAILABLE_PATH = '/etc/nginx/sites-available/';
    const NGINX_SITES_ENABLED = '/etc/nginx/sites-enabled/';
    const SITES_ROOT = '/var/www/sites';
    const DEFAULT_NGINX_CONFIG_PATH = path.normalize(path.join(__dirname, '..', 'config.txt'));

    let siteDir = path.join(SITES_ROOT, domain);
    let releasesDir = path.join(siteDir, 'releases');

    db.get('sites').push({
        id: shortid.generate(),
        domain,
        publicPath,
        siteDir,
        releasesDir
    }).write();

    if (!fs.existsSync(siteDir)) {
        fs.mkdirSync(siteDir);
    }
    if (!fs.existsSync(releasesDir)) {
        fs.mkdirSync(releasesDir);
    }

    console.log(`Creating dir ${dir}`);
    console.log(__dirname);

    let data = fs.readFileSync(DEFAULT_NGINX_CONFIG_PATH);
    console.log('OK: ' + DEFAULT_NGINX_CONFIG_PATH);
    console.log(data);

    let vHostPublicPath = path.join(siteDir, 'current');

    if (!!publicPath) {
        vHostPublicPath = path.join(vHostPublicPath, publicPath)
    }

    data = data.replace('#root#', vHostPublicPath);
    data = data.replace('#server_name#', domain);

    let vHostConfigFile = path.join(NGINX_SITES_AVAILABLE_PATH, domain);

    fs.writeFileSync(vHostConfigFile, data);
    fs.symlinkSync(vHostConfigFile, NGINX_SITES_ENABLED + domain);

    restartNginx((err, stdout, stderr) => {
    });
    res.send({result: 1});
});

router.post('/connectGit', (req, res, next) => {
    const {id, repoPath, branch} = req.body;
    if (!fs.existsSync('./keys')) {
        fs.mkdirSync('./keys');
    }
    let keyPath = `./keys/${id}.key`;
    let stdout = exec(`rm ${keyPath} && rm ${keyPath}.pub && ssh-keygen -t rsa -N "" -f ${keyPath}`, (err, stdout, stderr) => {
        if (!!err || !!stderr)
            return res.send({err, stdout, stderr});

        let site = db.get('sites').find({id}).assign({
            repo: {repoPath, branch, keyPath}
        }).write();
        let pub = fs.readFileSync(path.join(__dirname, '..', 'keys', `${id}.key.pub`), "utf8");
        res.send({pub, site});
    });
});

router.post('/checkConnection', (req, res, next) => {
    const {id, repoPath, branch} = req.body;
    let keyPath = `./keys/${id}.key`;

    exec(`ssh -i ${keyPath} -T git@bitbucket.org`, (err, stdout, stderr) => {
        let out = {
            status: 0,
            message: null
        };
        if (!!stderr && stderr.indexOf('Permission denied') > -1) {
            out.message = 'Permission denied';
        } else if (!!stderr) {
            out.message = stderr;
        } else if (!!stdout && stdout.indexOf('authenticated') > -1) {
            out.status = 1;
            out.message = 'authenticated';
            out.stdout = stdout
        }
        res.send(out);
    });

});

router.post('/getPublicKey', (req, res, next) => {
    const {id} = req.body;
    let keyPath = `./keys/${id}.key`;
    try {
        let pub = fs.readFileSync(path.join(__dirname, '..', 'keys', `${id}.key.pub`), "utf8");
        res.send(pub);
    } catch (e) {
        res.send({
            code: e.code,
            message: e.message,
        });
    }
});


router.post('/deploy', (req, res, next) => {
    const {id} = req.body;
    let site = db.get('sites').find({id}).value();
    res.send(site);
});

function restartNginx(callback) {
    exec('sudo nginx -t', (err, stdout, stderr) => {
        if (!!err || !!stderr)
            return callback(err, stdout, stderr);
        exec('sudo systemctl restart nginx', (err, stdout, stderr) => callback(err, stdout, stderr));
    });
}

module.exports = router;
