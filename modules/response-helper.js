module.exports = () => {
    let _this = this;


    _this.htmlHeader = (res) => {
        res.setHeader('Content-Type', 'text/html;charset=utf-8');
    };

    _this.jsonHeader = (res) => {
        res.add('Content-Type', 'application/json;charset=utf-8');
    };

    _this.sendNotFound = (res) => {
        _this.htmlHeader(res);
        res.status(404).send('<h1 style="color:#ff0000;">Not found</h1>');
    };


    _this.getCacheHeaderOpts = () => {
        return  {
            maxAge: 86400000,
            setHeaders: function(res, path) {
                res.setHeader("Expires", new Date(Date.now() + 2592000000*30).toUTCString());
              }
        };
    };

    return _this;
};