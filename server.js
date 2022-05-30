const express = require('express');
const path = require('path');
const config = require('config');
const compression = require('compression');
const bodyParser = require('body-parser');

const app = express();
app.use((req, res, next) => {
    // Optimize http header
    res.append('X-Content-Type-Options', 'nosniff');
    res.append('X-Frame-Options', 'DENY');
    res.append('X-XSS-Protection', '1; mode=block');
    res.append('Access-Control-Allow-Methods', config.get('app.server.allowHttpVerbs'));
    res.append('Access-Control-Allow-Origin', config.get('app.server.allowHttpOrigin'));
    
    next();
});


// Http Compression
app.use(compression());
// รองรับ Post application/json
app.use(bodyParser.json({ limit: '3mb' }));
// รอบรับ Post x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: true}));



//app.use(express.static(path.join(__dirname, 'public')));
app.use('/static', require('./modules/static-routes'));
app.use(config.get('app.server.apiBaseRoute'), require('./modules/map-routes'));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});
app.get('/index', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});
app.get('/home', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});


var server = app.listen(process.env.PORT || 3000, () => {
    console.log('Server running on port ' + server.address().port);
});