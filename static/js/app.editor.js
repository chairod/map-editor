angular.module('AppEditor', []).controller('EditorController', ($scope, $timeout, $dialogService, $fileReaderService, $tileMapService, $tilesetService) => {
    /**
     * Class สำหรับจัดการ Tile ที่ถูกเลือก เพื่อวาดลงแผนที่
     * @returns 
     */
    const TileSelectCls = function (ctx) {
        this.ctx = ctx;
        this.tiles = [];
        this.rotate = 0;
        this.flip = null;
        this.visibleOnScreen = false; // true = แสดงรายการ Tile ที่เลือกไว้ บนหน้าเว็บ

        const toJson = (obj) => {
            return JSON.stringify(obj);
        };
        const renderFlipTypes = () => {
            var flipTypes = [];
            if(this.rotate > 0)
                flipTypes.push($tileMapService.createFlipType($tileMapService.getRotateFlipTypeVal(), this.rotate));
            if (this.flip !== null)
                flipTypes.push($tileMapService.createFlipType(this.rotate === 270 ? $tileMapService.getVerticalFlipTypeVal() : this.flip));

            //console.log(`flip: ${JSON.stringify(flipTypes)}`);
            return flipTypes;
        };
        const isVertical = () => {
            return this.rotate === 90 || this.rotate === 270;
        };

        this.clear = () => {
            this.tiles = [];
            this.rotate = 0;
            this.flip = null;
            return this;
        };
        this.hasTile = () => {
            return this.tiles.length > 0;
        };

        /**
         * วาดรายการ Tile ที่ถูกเลือกลง Canvas
         * @param {*} ctxSource 
         * @returns 
         */
        this.drawTile = (ctxSource) => {
            if(!this.hasTile() || ctxSource === null) return;

            const tileProps = this.getTileInfo();
            var arImageData = ctxSource.getImageData(tileProps.dx, tileProps.dy, tileProps.width, tileProps.height);
            this.ctx.canvas.width = tileProps.width;
            this.ctx.canvas.height = tileProps.height;
            $tileMapService.clearAllRect(this.ctx);
            this.ctx.putImageData(arImageData, 0, 0);

            // Rotate & Flip
            var canvasRotateAndFlip = $tileMapService.rotateAndFlipImage(this.ctx.canvas, tileProps.flipTypes);
            $tileMapService.clearAllRect(this.ctx);
            if(this.rotate === 90 || this.rotate === 270){
                this.ctx.canvas.width = tileProps.height;
                this.ctx.canvas.height = tileProps.width;
            }
            this.ctx.drawImage(canvasRotateAndFlip, 0, 0);
        };

        /**
         * เขียนข้อมูล Tile ที่เลือกลงไปบนแผนที่
         * @param {*} tileset       tileset ที่ active อยู่ในปัจจุบัน
         * @param {*} mapPoint      ตำแหน่ง x,y ของเม้าส์ที่อยู่บนแผนที่ ณ ปัจจุบัน (mousePosOnCanvas)
         */
        var drawToMapTimeId = null;
        this.drawToMap = (tileset, mapPoint, callback) => {
            const tileInfo = this.getTileInfo();
            var newPoint = $.extend(true, {}, mapPoint);
            // 10 คือค่า Sensitive ลดทอนตำแหน่งของเม้าส์
            if(isVertical()){
                newPoint.dx -= (tileInfo.height - 10);
                newPoint.dy -= (tileInfo.width - 10);
            }else{
                newPoint.dx -= (tileInfo.width - 10);
                newPoint.dy -= (tileInfo.height - 10);
            }

            // จัดกลุ่มรูปภาพ ตาม row || column
            // สำหรับไล่เขียนภาพจาก แถวแรก -> แถวสุดท้าย
            const tileGroups = {};
            for(var i=0;i<this.tiles.length;i++){
                var key = isVertical() ? this.tiles[i].columnIndex : this.tiles[i].rowIndex;
                if(undefined === tileGroups[key]) tileGroups[key] = [];
                tileGroups[key].push(this.tiles[i]);
                
                if(this.rotate === 90) // จัดลำดับคอลัมล์ จากท้ายสุดขึ้นก่อน
                    tileGroups[key].sort((a,b) => {
                        if(a.rowIndex === b.rowIndex) return 0;
                            return a.rowIndex > b.rowIndex ? -1 : 1;
                    });
                if(this.rotate === 180) // จัดลำดับคอลัมล์ จากท้ายสุดขึ้นก่อน
                    tileGroups[key].sort((a,b) => {
                        if(a.columnIndex === b.columnIndex) return 0;
                            return a.columnIndex > b.columnIndex ? -1 : 1;
                    });

                if(this.flip !== null)
                    tileGroups[key].sort((a,b) => {
                        if(isVertical()){
                            if(a.rowIndex === b.rowIndex) return 0;
                            if(this.rotate === 90)
                                return a.rowIndex > b.rowIndex ? 1 : -1;
                            else 
                                return a.rowIndex > b.rowIndex ? -1 : 1;
                        }else{
                            if(this.rotate === 180){
                                if(a.columnIndex === b.columnIndex) return 0;
                                return a.columnIndex > b.columnIndex ? 1 : -1;
                            }else{
                                if(a.columnIndex === b.columnIndex) return 0;
                                return a.columnIndex > b.columnIndex ? -1 : 1;
                            }
                        }
                    });
            }

            const keys = Object.keys(tileGroups);
            if(this.rotate === 180 || this.rotate === 270){ // Reverse แถวจากล่างขึ้นบน
                keys.sort((a,b) => {
                    if(+a === +b) return 0;
                    return +a > +b ? -1 : 1;
                });
            }
            
            const mapPos = seekMapPosByPoint(newPoint); // ตำแหน่ง column, row เริ่มต้นในการเขียน tile ลงบนแผนที่
            const tilesetColumnWidth = tileset.imagewidth / tileset.tilewidth; // จำนวนคอลัมล์ของแผนที่
            const flipTypes = renderFlipTypes();
            const tileWidth = $scope.$settings.tileMapJson.tilewidth;
            const tileHeight = $scope.$settings.tileMapJson.tileheight;
            const workLayer = $scope.$settings.formView.activeLayer;
            var index = 0;
            do{
                var tileItems = tileGroups[keys[index]];
                for(var i=0;i<tileItems.length;i++){
                    var tile = tileItems[i];
                    var tileId = (tile.rowIndex * tilesetColumnWidth + tile.columnIndex) + tileset.firstgid;
                    var imageIndex = $tileMapService.flipTypesToImageIndex(flipTypes, tileId);
                    var arImageData = tileset.ctx.getImageData(tile.columnIndex * tileWidth, tile.rowIndex * tileHeight, tileWidth, tileHeight);
                    
                    // เขียนเฉพาะ tile ที่มีข้อมูลรูปภาพ
                    if(arImageData.data.filter((val) => { return val > 0; }).length > 0)
                        workLayer.updateTileBy(mapPos.columnIndex + i, mapPos.rowIndex + index, imageIndex, arImageData);
                }
            }while(++index < keys.length);


            clearTimeout(drawToMapTimeId);
            drawToMapTimeId = setTimeout(() => {
                if(callback) callback();
            }, 1000);
        };

        /**
         * ย้ายตำแหน่งของ Canvas ไปยังตำแหน่งต่างๆบนหน้าเว็บ
         * @param {*} clientX 
         * @param {*} clientY
         */
        this.moveTo = (clientX, clientY) => {
            const tileInfo = this.getTileInfo();
            var dx = clientX - tileInfo.width;
            var dy = clientY - tileInfo.height;
            if(isVertical()){
                dx = clientX - tileInfo.height;
                dy = clientY - tileInfo.width;
            }
            $(this.ctx.canvas).offset({top: dy, left: dx});

            //$(this.ctx.canvas).offset({top: clientY, left: clientX});
        };

        /**
         * หมุนข้อมูลรูปภาพ
         * @param {*} flag  Z = หมุนภาพ, X = Flip หรือพลิกรูปภาพ
         */
        this.flipTile = (flag) => {
            if (!flag) return this;

            flag = flag.toUpperCase();
            if('Z' === flag){
                if(this.flip === $tileMapService.getHorizontalFlipTypeVal()){
                    if(this.rotate === 0) this.rotate = 270;
                    else this.rotate -= 90;
                }else{
                    this.rotate += 90;
                    this.rotate = this.rotate === 360 ? 0 : this.rotate;
                }
            }else if('X' === flag){
                if(this.flip !== null) this.flip = null;
                else this.flip = $tileMapService.getHorizontalFlipTypeVal()
            }

            return this;
        };

        /**
         * เพิ่มรายการ tile ที่เลือก
         * @param {*} tileset       เลือก tile มาจาก tileset ใด
         * @param {*} tilePos       ตำแหน่ง column,row ของ tile ได้จากการเรียกใช้ฟังชันก์  seekMapPosByPoint
         */
        this.addTile = (tileset, tilePos) => {
            const colCount = tileset.imagewidth / tileset.tilewidth - 1; // จำนวนคอลัมล์ทั้งหมดของ tileset
            const rowCount = tileset.imageheight / tileset.tileheight - 1; // จำนวนแถวทั้งหมดของ tileset
            if (tilePos.columnIndex > colCount || tilePos.rowIndex > rowCount || this.tiles.map((item) => toJson(item)).indexOf(toJson(tilePos)) !== -1)
                return false;
            this.tiles.push(tilePos);

            // เก็บข้อมูล tile ที่เลือกให้ครบทุกตำแหน่ง
            const tileInfo = this.getTileInfo();
            var tiles = [], posY = tileInfo.dy;
            do{
                var posX = tileInfo.dx;
                do{
                    tiles.push(seekMapPosByPoint(coordinate(posX, posY)));
                    posX += $scope.$settings.tileMapJson.tilewidth;
                }while(posX < (tileInfo.dx + tileInfo.width));
                posY += $scope.$settings.tileMapJson.tileheight;
            }while(posY < (tileInfo.dy + tileInfo.height));
            this.tiles = tiles;
            console.log(`${JSON.stringify(tiles)}`);
            return true;
        };

        this.getTileInfo = () => {
            var cols = this.tiles.map((item) => {
                return item.columnIndex;
            });
            var rows = this.tiles.map((item) => {
                return item.rowIndex;
            });
            const arrayMinMaxVal = (ar, type) => {
                ar.sort((a, b) => {
                    if (a === b) return 0;
                    return a > b ? 1 : -1;
                });
                return 'min' === type ? ar[0] : ar[ar.length - 1];
            };

            const minColIndex = arrayMinMaxVal(cols, 'min'),
                maxColIndex = arrayMinMaxVal(cols, 'max');
            const minRowIndex = arrayMinMaxVal(rows, 'min'),
                maxRowIndex = arrayMinMaxVal(rows, 'max');
            const tileWidth = $scope.$settings.tileMapJson.tilewidth,
                tileHeight = $scope.$settings.tileMapJson.tileheight;

            var point = {
                dx: minColIndex * tileWidth,
                dy: minRowIndex * tileHeight
            };
            var width = (maxColIndex - minColIndex + 1) * tileWidth;
            var height = (maxRowIndex - minRowIndex + 1) * tileHeight;
            return {
                dx: point.dx,
                dy: point.dy,
                width: width,
                height: height,
                flipTypes: renderFlipTypes()
            };
        };
    };

    /**
     * จัดการลบข้อมูล Tile ในแต่ละ Layer
     */
    const TileEraserCls = function(ctx){
        const drawEraser = () => {
            $tileMapService.clearAllRect(this.ctx);
            this.ctx.canvas.width = this.ctx.canvas.height = this.size;

            // ใส่พื้นสีแดงให้กับ Canvas
            this.ctx.save();
            this.ctx.globalAlpha = 0.6;
            this.ctx.fillStyle = '#ff0000';
            this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
            this.ctx.restore();

            // เขียนเส้นขอบ
            this.ctx.save();
            this.ctx.lineWidth = 3;
            this.ctx.strokeStyle = '#000';
            this.ctx.strokeRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);
            this.ctx.restore();

            // วาดภาพยางลบลงบน Canvas
            this.ctx.drawImage(img, Math.floor(this.ctx.canvas.width / 2) - 16, Math.floor(this.ctx.canvas.height / 2) - 16);
        };

        this.size = 32; // ขนาดของ Eraser 
        this.visible = false; // true = แสดง Eraser บนหน้าเว็บ
        this.enable = false; // true = เปิดใช้งาน Eraser
        this.ctx = ctx;

        // โหลดรูปภาพยางลบ เพื่อวาดลง canvas
        var img = new Image();
        img.onload = () => {
            drawEraser();
        };
        img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAzgAAAM4BlP6ToAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAAG+SURBVFiFxdc/axRBGIDxX0454Q6uFSsbQSF+BQUliiL4Daz8CsYioES/gI2lnWAXohaihf9ARJugBhtFOxNFsFByYBHPYue4ybI5d27nzheW29l533meuWV2dvnPMZdxnHNYQBtruIN+pvHHRhcPMCgdn3BkFvCnEXQNj7Ad2pvTlCjDl41u6WlsTVOig8cR/GpFzjH8Cv3fMD9L+NQkUuBVEl+bSHQUs0iBZ5Moz/w3jieOMbFEF88i+M/wu4UTiRInjVbHFxxIhV9RLKmNhhL9UH8rFT6MphLXjVZGMjyHxMVQV7lX1IE3kehhPdS8aAKPJTZrSvTwMuT+wdmm8BSJGD7ApbizgydRZ8pDpo5EF8+j8Zfiwn127mopM68jUZ75YrloORO8SqKP9+Pg8Dl03s4AH8ZRfI/Au8IpnusDXMgo0MObCH5zXPKHkLSSER7f8xv/KrickpwI3/Vvj2MP7mWQmAg+jDbuNpAYu86nLZEFPqlEY/gczis2hVa41sIpHAztd3hVUbtX8Tm2P7Rf421N7jbu4yGjV6xZHxvDWVzDmQrLFg6F84+hKI42DuOH4v0uNVYnqMkffwFuKvRYcmx/RQAAAABJRU5ErkJggg==';

        /**
         * จำนวนที่ต้องการเพิ่ม หรือ ลด ขนาดของยางลบ
         * คำนวณจาก ขนาด 32 pixel และคูณกับ increase ที่ผ่านเข้ามา
         * @param {*} increase  ตัวเลขที่ต้องการเพิ่มหรือลด ให้ส่งค่ามาเป็น 1,2,3,...5 สูงสุดไม่เกิน 5
         */
        this.newSize = (increase) => {
            const maxEraserSize = 160; // 5 เท่า (32 * 5)
            const minEraserSize = 32;

            this.size = Math.min(Math.abs(increase) * 32, maxEraserSize);
            this.size = Math.max(minEraserSize, this.size);
            drawEraser();
        };
        /**
         * ต้องการลดขนาดของ Eraser -size, size เพิ่มขนาดของ Eraser
         * @param {*} increaseStr -size (ลด), size (เพิ่ม)
         */
        this.newSizeByStr = (increaseStr) => {
            const increaseVal = Math.abs(+increaseStr);
            var size = this.getSize();
            if(increaseStr[0] === '+') size += increaseVal;
            else size -= increaseVal;

            if(increaseStr === 'min') this.newSize(1);
            else if(increaseStr === 'max') this.newSize(5);
            else this.newSize(size);
        };
        this.getSize = () => {
            return this.size / 32;
        };


        /**
         * ย้ายตำแหน่งของยางลบ ไปตามการเลื่อนของเม้าส์
         * 
         * @param {*} mouseEvent
         */
        this.moveTo = (mouseEvent) => {
            const dx = mouseEvent.clientX - this.size;
            const dy = mouseEvent.clientY - this.size;
            // const halfVal = Math.floor(this.size / 2);
            // point.dx += halfVal;
            // point.dy += halfVal;
            
            $(this.ctx.canvas).offset({top: dy, left: dx});
        };

        /**
         * ลบข้อมูลใน Data attribute ของ Layer ที่กำลังทำงานอยู่
         * @param {*} mapPoint      ตำแหน่ง x,y ของเม้าส์ที่อยู่บน Map mousePosOncanvas()
         * @param {*} activeLayer   Layer ที่ต้องการลบข้อมูลออก เรียกจาก activeLayer()
         */
        var doEraserCallbackId = null;
        this.doEraser = (mapPoint, activeLayer, callback) => {
            if(!this.enable) return;
            const sensitiveVal = this.size - 1;
            var newPoint = $.extend(true, {}, mapPoint);
            newPoint.dx -= sensitiveVal;
            newPoint.dy -= sensitiveVal;
            const mapPos = seekMapPosByPoint(newPoint);

            var vertical = 32;
            do {
                var horizontal = 32;
                do {
                    activeLayer.updateTileBy(mapPos.columnIndex + (horizontal / 32 - 1), mapPos.rowIndex, 0, null);
                    horizontal += 32;
                } while (horizontal <= this.size);
                mapPos.rowIndex += 1;
                vertical += 32;
            } while (vertical <= this.size);

            clearTimeout(doEraserCallbackId);
            doEraserCallbackId = setTimeout(() => {
                if(callback) callback();
            }, 1000);
        };
    };


    

    $scope.$settings = {
        tileMapJson: null,
        map: {
            ctx: document.getElementById('mapCanvas').getContext('2d'),
            primaryCtx: $tileMapService.createContext2d(32, 32), // Canvas หลังจากโหลดแผนที่เสร็จ หากแก้ไขแผนที่ ให้อัพเดตด้วย
            mapLayers: [], // ข้อมูล Map Layer ที่ได้จากการอ่านแผนที่ด้วย $tileMapService
            ordTileMapJson: null, // ข้อมูลแผนที่ ที่เปิดแก้ไขครั้งแรก (สำหรับ Reverse กลับไปจุดเริ่มต้น)
            filename: null, // ชื่อ json file ที่อัพโหลดเพื่อแก้ไข
            isReady: false, // สถานะของแผนที่ พร้อมหรือไม่

            point: { dx: null, dy: null }, // พิกัดของ x,y ปัจจุบันของแผนที่ ตามการเลื่อนของเม้าส์

            isDragging: false,

            // scale properties
            scale: 1,
            scaleSensitive: 0.0005,
            scaleMin: 0.1,
            scaleMax: 3
        },
        inputFile: {
            element: $('<input type="file" />'),
            type: null,
            params: null
        },
        formView: {
            statusText: 'Ready!!', // บอกสถานะปัจจุบันของการทำงาน Editor

            visibleMapProperty: false, // แสดง Map Properties Panel
            resizingMapProperty: false, // กำลังลากเม้าส์ เพื่อขยายขนาดของ Map Properties Panel
            eraserTile: new TileEraserCls(document.getElementById('eraserTile').getContext('2d')), // ยางลบ ลบข้อมูล Tile ของแต่ละ Layer ในแผนที่

            selectedTileset: null, // ชื่อ Tileset ที่เลือกอยู่ ณ ปัจจุบัน
            tilesetSelectStart: false, // สถานะการนำเม้าส์ ไปลากบน Tileset เพื่อระบุตำแหน่งของ Tileset ที่กำลังเลือกเพื่อวาดลงบนแผนที่
            selectedTile: new TileSelectCls(document.getElementById('selectTile').getContext('2d')), // ข้อมูล Tile ของ tileset ที่ถูกเลือกเพื่อวาดลงบนแผนที่

            // Layer ปัจจุบันที่ Active อยู่
            // ค่าจะถูกกำหนดให้เมื่อ  โหลดแผนที่เสร็จ || call setActiveLayer() 
            activeLayer: null
        }
    };

    /**
     * สร้าง Coordinate property
     * @param {*} dx 
     * @param {*} dy 
     * @returns 
     */
    const coordinate = (dx, dy) => {
        return {dx: dx, dy: dy};
    };
    /**
     * คำนวนตำแหน่ง x,y ของเม้าส์ที่แสดงบน canvas
     * @param {*} canvas 
     * @param {*} mouseEvent 
     */
    const mousePosOnCanvas = (canvas, mouseEvent) => {
        if(!canvas || !mouseEvent) return null;

        var clientRect = canvas.getBoundingClientRect();

        const left = mouseEvent.clientX - clientRect.left;
        const top = mouseEvent.clientY - clientRect.top;

        return coordinate(left, top);
    };

    /**
     * ค้นหาตำแหน่ง column, row ที่เม้าส์ Pos อยู่บน Canvas
     * ค่า columnIndex, rowIndex จะเริ่มจาก 0
     * @param {*} point  ค่าที่ได้จาก mousePosOnCanvas
     * @returns {columnIndex: ..., rowIndex: ...}
     */
    const seekMapPosByPoint = (point) => {
        if(!point) return null;

        const scale = $scope.$settings.map.scale;
        const calSizeByScale = (size) => {
            return size * scale;
        };

        const tileWidth = calSizeByScale($scope.$settings.tileMapJson.tilewidth);
        const tileHeight = calSizeByScale($scope.$settings.tileMapJson.tileheight);

        const columnIndex = Math.floor(calSizeByScale(point.dx) / tileWidth);
        const rowIndex = Math.floor(calSizeByScale(point.dy) / tileHeight);
        return { columnIndex: columnIndex, rowIndex: rowIndex };
    };
    /**
     * คำนวณตำแหน่งของเม้าส์ ที่อยู่บน Map
     * @param {*} e         Event Object 
     */
     const mousePosOnMap = function(e){
        if(!$scope.$settings.map.isReady) return;

        // คำนวณตำแหน่งของเม้าส์ บน Map
        var point = mousePosOnCanvas($scope.$settings.map.ctx.canvas, e);
        const mapPos = seekMapPosByPoint(point);

        $scope.$settings.map.point = point;
        $scope.updateStatus(`[${point.dx+','+point.dy}], col: ${mapPos.columnIndex}, row: ${mapPos.rowIndex}`);
    };

    const applyUpdateStatusChange = (statusText) => {
        if ($scope.$$phase)
            $scope.updateStatus(statusText)
        else
            $scope.$apply($scope.updateStatus(statusText));
    };



    // กำหนดเหตุการณ์ให้กับ แผนที่
    // ปิดการใช้งาน ฟังชันก์ นี้ก่อน เนื่องจาก คำนวณ x,y ของเม้าส์ที่วางอยู่บนแผนที่ ไม่ถูกต้อง เมื่อมีการ zoom in-out
    // $scope.$settings.map.ctx.canvas.addEventListener('wheel', (e) => {
    //     if (!$scope.$settings.map.isReady) return;

    //     var scale = +($scope.$settings.map.scale + (e.deltaY * $scope.$settings.map.scaleSensitive)).toFixed(4);
    //     scale = Math.min(scale, $scope.$settings.map.scaleMax);
    //     scale = Math.max(scale, $scope.$settings.map.scaleMin);
    //     $scope.$settings.map.scale = scale;
    //     $scope.zoomLevel();

    //     e.preventDefault();
    // });
    const mapCanvas = $scope.$settings.map.ctx.canvas;
    mapCanvas.addEventListener('mousedown', (e) => {
        $scope.$apply(mousePosOnMap(e));
        $scope.$settings.map.isDragging = true;

        if($scope.$settings.map.isReady){
            if($scope.$settings.formView.eraserTile.visible){
                $scope.$settings.formView.eraserTile.enable = true;
                const mapPoint = $scope.$settings.map.point;
                const activeLayer = $scope.$settings.formView.activeLayer;
                $scope.$settings.formView.eraserTile.doEraser(mapPoint, activeLayer, () => {
                    $scope.updateMap();
                });
                $scope.updateMap();
            }else if($scope.$settings.formView.selectedTile.hasTile()){
                $scope.$settings.formView.selectedTile.drawToMap($scope.$settings.formView.selectedTileset, $scope.$settings.map.point, () => {
                    $scope.updateMap();
                });                
            }
        }
    });
    var mapMouseLeaveId = null;
    mapCanvas.addEventListener('mouseleave', (e) => {
        $timeout.cancel(mapMouseLeaveId);
        mapMouseLeaveId = $timeout(() => {
            $scope.$settings.formView.selectedTile.visibleOnScreen = false;
        }, 250);
    });
    mapCanvas.addEventListener('mousemove', (e) => {
        $timeout.cancel(mapMouseLeaveId);
        
        if($scope.$settings.formView.selectedTile.hasTile())
            $scope.$settings.formView.selectedTile.visibleOnScreen = true;
    });

    var documentMouseMoveEvent = null;
    document.addEventListener('mousemove', (e) => {
        documentMouseMoveEvent = e;

        if ($scope.$settings.map.isReady) {
            $scope.$apply(mousePosOnMap(e));

            // เลือกตำแหน่งของ Tile ที่ถูกเลือกตามตำแหน่งของเม้าส์
            $scope.$settings.formView.selectedTile.moveTo(e.clientX, e.clientY);

            // เลื่อนตำแหน่งของ eraser tile ไปตามตำแหน่งของเม้าส์ที่เปลี่ยนแปลง
            $scope.$settings.formView.eraserTile.moveTo(e);

            // มีการเลือก tile เพื่อวาดบนแผนที่ 
            // ให้แสดง Layer ที่นอกเหนือจาก active อยู่เป็น blur
            var otherLayerOpacity = 1;
            if($scope.$settings.formView.eraserTile.visible){
                otherLayerOpacity = 0;
                if($scope.$settings.formView.eraserTile.enable){
                    const mapPoint = $scope.$settings.map.point;
                    const activeLayer = $scope.$settings.formView.activeLayer;
                    $scope.$settings.formView.eraserTile.doEraser(mapPoint, activeLayer, () => {
                        $scope.updateMap();
                    });
                    e.preventDefault();
                }
            }else if ($scope.$settings.formView.selectedTile.hasTile() && $scope.$settings.formView.selectedTile.visibleOnScreen){
                otherLayerOpacity = 0.1;

                if($scope.$settings.map.isDragging){
                    $scope.$settings.formView.selectedTile.drawToMap($scope.$settings.formView.selectedTileset, $scope.$settings.map.point, () => {
                        $scope.updateMap();
                    });
                    e.preventDefault();
                }
            }
            blurOtherLayerExceptActive(otherLayerOpacity);


            // Map moving
            // var scale = $scope.$settings.map.scale;
            // if ($scope.$settings.map.isDragging && scale > 1.08) {
            //     document.body.style.cursor = 'move';
            //     //console.log('Map Moving: set cursor to moving ...');

            //     var point = $scope.$settings.map.point;
            //     var ctx = $scope.$settings.map.ctx;

            //     ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            //     ctx.translate(point.dx, point.dy);
            //     ctx.scale(scale, scale);
            //     ctx.translate(point.dx * -1, point.dy * -1);
            //     ctx.drawImage($scope.$settings.map.primaryCtx.canvas, 0, 0);
            //     ctx.resetTransform();

            //     e.preventDefault();
            // }
        }

        // ย่อ/ขยาย ขนาดของ Panel ของคุณสมบัติแผนที่
        if ($scope.$settings.formView.visibleMapProperty && $scope.$settings.formView.resizingMapProperty) {
            var mapPropertyPanelEl = $('#mapPropertyPanel');
            var newWidth = Math.max(350, e.clientX - 15); // 15 padding-left of container-fluid
            mapPropertyPanelEl.css({
                'width': `${newWidth}px`,
                'max-width': `${newWidth}px`
            });
            e.preventDefault();
        }


        // เลือกรูปภาพจาก Tileset
        if ($scope.$settings.formView.tilesetSelectStart) {
            const point = mousePosOnCanvas(e.target, e);
            const mapPos = seekMapPosByPoint(point);

            if ($scope.$settings.formView.selectedTile.addTile($scope.$settings.formView.selectedTileset, mapPos))
                drawTileset();

            e.preventDefault();
        }
    });
    document.addEventListener('mouseup', (e) => {
        document.body.style.cursor = 'default';
        $scope.$settings.map.isDragging = false;

        $scope.$settings.formView.resizingMapProperty = false;
        $scope.$settings.formView.tilesetSelectStart = false;

        $scope.$settings.formView.eraserTile.enable = false;
    });
    document.addEventListener('keydown', (e) => {
        var key = (e.key || '').toUpperCase();
        if ('ESCAPE' === key) {
            //$scope.reloadMap();

            $scope.$settings.formView.selectedTile.clear();
            drawTileset();

            $scope.$settings.formView.eraserTile.visible = false;
            $scope.$settings.formView.eraserTile.enable = false;

            e.preventDefault();
        }
        
        const keyList = ['Z', 'X'];
        if($scope.$settings.formView.selectedTile.hasTile() && keyList.indexOf(key) > -1){
            $scope.$settings.formView.selectedTile.flipTile(key);
            $scope.$settings.formView.selectedTile.drawTile(tilesetCtx);
            $scope.$settings.formView.selectedTile.moveTo(documentMouseMoveEvent.clientX, documentMouseMoveEvent.clientY);
            e.preventDefault();
        }

        //console.log(`keyCode: ${e.keyCode}, key: ${e.key}`);
    });



    // เมื่อ input file เปลี่ยนแปลง จะอ่านข้อมูลจากไฟล์ที่อัพโหลดตาม type (inputFile.type)
    $scope.$settings.inputFile.element.on('change', function (e) {
        if ('tileMap' === $scope.$settings.inputFile.type) {
            applyUpdateStatusChange('โหลดไฟล์แผนที่...');

            $scope.clearMap();
            $scope.$settings.tileMapJson = null;
            $scope.$settings.map.filename = e.target.files[0].name; // ชื่อไฟล์นี้ ใช้สำหรับ ดาวน์โหลด
            $scope.$settings.map.isReady = false;
            $tileMapService.clearAllRect($scope.$settings.map.primaryCtx);

            $fileReaderService.doUpload(e, 'json', 3).then(function (data) {
                $scope.$settings.inputFile.element.val('');

                applyUpdateStatusChange('อ่านข้อมูลแผนที่');
                $tilesetService.syncConvertFileData(data).then((json) => {
                    if (null === json){
                        $dialogService.danger('', 'โหลดข้อมูลแผนที่ไม่สำเร็จ ลองอีกครั้ง ...');
                        return;
                    }else if(json.orientation !== 'orthogonal'){
                        $dialogService.danger('', 'รองรับเฉพาะประเภทแผนที่ orthogonal');
                        return;
                    }

                    tileMapJson = json || {};
                    var tilesetUndefined = [];
                    const tilesetLoader = () => {
                        return new Promise((resolve) => {
                            var tilesetCount = tileMapJson.tilesets.length;
                            var syncCount = 1;

                            function loader() {
                                var tileset = tileMapJson.tilesets[syncCount - 1];
                                applyUpdateStatusChange(`โหลด Tileset: ${tileset.name} ...`);
                                $tilesetService.syncTileset(tileset.name).then((fileData) => {
                                    if(fileData === null)
                                        tilesetUndefined.push(tileset.name);
                                    else{
                                        $tileMapService.getImageBy(fileData).then((retImg) => {
                                            // เพิ่ม Property ใหม่ให้กับ Tileset
                                            tileset.imgObj = retImg;
                                            tileset.ctx = $tileMapService.createContext2d(retImg.width, retImg.height);
                                            tileset.ctx.drawImage(retImg, 0, 0);
        
                                            if(++syncCount <= tilesetCount) loader();
                                            else resolve();
                                        });
                                    }
                                });
                            }
                            loader();
                        });
                    };
                    tilesetLoader().then(() => {
                        const tilesetNotfoundStr = tilesetUndefined.join(',');
                        if('' !== tilesetNotfoundStr)
                            $dialogService.danger(null, 'ไม่พบไฟล์ภาพ tileset ต่อไปนี้ มีผลทำให้การวาดแผนที่บางส่วนจะขาดหายไป =>  ' + tilesetNotFoundStr);

                        applyUpdateStatusChange('กำลังวาดแผนที่ ...');
                        $scope.initMap(tileMapJson);
                    });


                });
            }, () => {
                $scope.updateStatus();
            });
        }
    });


    /**
     * เปิดหน้าต่าง ให้เลือกไฟล์แผนที่
     */
    $scope.loadMap = function () {
        $scope.$settings.inputFile.type = 'tileMap';
        $scope.$settings.inputFile.element.click();
    };
    /**
     * นำข้อมูล Map Json ไปวาดลงบน canvas และ init ค่าอื่นๆให้กับ editor
     * @param {*} tileMapJson 
     */
    $scope.initMap = (tileMapJson) => {
        $scope.$settings.tileMapJson = tileMapJson;
        $scope.$settings.map.ordTileMapJson = $.extend(true, {}, tileMapJson);

        // กำหนดค่าเริ่มต้นให้เลือก Tileset ตัวแรก
        $scope.$settings.formView.selectedTileset = tileMapJson.tilesets[0];
        $timeout(drawTileset(), 100);

        $tileMapService.init($scope.$settings.map.ctx, tileMapJson).then((retContext) => {
            applyUpdateStatusChange();
            $timeout(() => {
                $scope.$settings.map.isReady = true;
            }, 2000);
            $tileMapService.cloneContext(retContext, $scope.$settings.map.primaryCtx);
            $scope.$settings.map.mapLayers = $tileMapService.getMapLayers();

            // กำหนด Layer เริ่มต้นเพื่อเตรียมรอการแก้ไข
            var findMapLayers = $scope.$settings.map.mapLayers.filter((item) => {
                return item.visible;
            });
            if (findMapLayers.length > 0) findMapLayers[0].isActive = true;
            $scope.$settings.formView.activeLayer = activeLayer();
        });
    };
    /**
     * ยกเลิกการเปลี่ยนแปลงทั้งหมด
     */
    $scope.resetAllChange = function () {
        if (null === $scope.$settings.tileMapJson) {
            $scope.loadMap();
            return;
        }
        if(!$scope.$settings.map.isReady) return;

        const tileMapJson = $.extend(true, {}, $scope.$settings.map.ordTileMapJson);
        $scope.initMap(tileMapJson);

        $scope.$settings.formView.selectedTile.clear();
        $scope.$settings.formView.eraserTile.visible = false;
        $scope.$settings.formView.eraserTile.enable = false;
    };
    $scope.saveMap = () => {
        $tileMapService.updateMap();
        $scope.exportMap();
    };
    $scope.zoomLevel = function () {
        if(!$scope.$settings.map.isReady) return;

        var ctx = $scope.$settings.map.ctx;
        var scale = $scope.$settings.map.scale;

        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        if (scale <= 1) {
            // ย่อขนาดของภาพ ให้แปลงข้อมูลไปยังตำแหน่ง 0,0 เสมอ
            ctx.scale(scale, scale);
            $('.editor-container').animate({scrollTop: 0, scrollLeft: 0}, 300);
        } else {
            // ขยายขนาดของภาพ

            // กำหนดตำแหน่งการเปลี่ยนแปลง
            // จะเท่ากับตำแหน่งที่ 0,0 เช่น ctx.drawImage(xImage, 0, 0) จะถูกเขียนในตำแหน่ง translate
            var point = $scope.$settings.map.point;
            ctx.translate(point.dx, point.dy);
            ctx.scale(scale, scale);
            ctx.translate(point.dx * -1, point.dy * -1);
        }
        ctx.drawImage($scope.$settings.map.primaryCtx.canvas, 0, 0);
        ctx.resetTransform();

        // แบบที่ 1 save & restore
        // เมื่อเปลี่ยนแปลง scale แล้วให้ reset matrix กลับไปเป็นค่าเริ่มต้น (restore)
        // ctx.save();
        // ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // ctx.translate(point.dx, point.dy);
        // ctx.scale(scale, scale);
        // ctx.translate(point.dx * -1, point.dy * -1);
        // ctx.drawImage($scope.$settings.map.image, 0, 0);
        // ctx.restore();

        //แบบที่ 2
        // เมื่อเปลี่ยนแปลง scale แล้วให้ reset matrict กลับไปเป็นค่าเริ่มต้น (resetTransform, setTransform(1, 0, 0, 1, 0, 0))
        // ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        // ctx.translate(point.dx, point.dy);
        // ctx.scale(scale, scale);
        // ctx.translate(point.dx * -1, point.dy * -1);
        // ctx.drawImage($scope.$settings.map.image, 0, 0);
        // ctx.resetTransform();
    };
    /**
     * ส่งออกข้อมูลไฟล์แผนที่ ในรูปแบบ json file
     */
    $scope.exportMap = () => {
        if (null === $scope.$settings.tileMapJson) {
            $dialogService.danger(null, 'ยังไม่มีแผนที่  ให้เลือกแผนที่ ที่ต้องการแก้ไขก่อนถึงจะดาวน์โหลดได้');
            return;
        }

        var link = $('<a href="javascript:void(0)" target="_blank" />');
        link[0].download = $scope.$settings.map.filename;
        link[0].href = `data:text/json;base64,${btoa(angular.toJson($scope.$settings.tileMapJson))}`;
        link[0].click();
    };
    /**
     * เคลียร์แผนที่ ให้เป็นว่าง
     */
    $scope.clearMap = () => {
        var ctx = $scope.$settings.map.ctx;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.resetTransform();
        $scope.$settings.map.scale = 1;

        $scope.$settings.map.ordTileMapJson = null;
        $scope.$settings.map.filename = null;
        $scope.$settings.map.mapLayers = [];


        $scope.$settings.formView.visibleMapProperty = false;
        $scope.$settings.formView.resizingMapProperty = false;
        
        $scope.$settings.formView.selectedTileset = null;
        $scope.$settings.formView.selectedTile.clear();

        $scope.$settings.formView.activeLayer = null;
    };
    /**
     * ปรับปรุงสถานะการทำงานของ Editor
     * @param {*} statusText 
     */
    // var elMapStatus = null;
    $scope.updateStatus = (statusText) => {
        $scope.$settings.formView.statusText = statusText || 'Ready!!';
    };




    //=========================================================
    // ตัวช่วยจัดการข้อมูลแผนที่
    //=========================================================
    // ปรับปรุงแผนที่ เมื่อมีการแก้ไข หรือ มีการเปลี่ยนแปลงใดๆ
    $scope.updateMap = () => {
        if (!$scope.$settings.map.isReady) return;
        $scope.$settings.map.isReady = false;
        $tileMapService.clearAllRect($scope.$settings.map.ctx);
        $tileMapService.drawMap(true);

        $tileMapService.cloneContext($scope.$settings.map.ctx, $scope.$settings.map.primaryCtx);
        $timeout(() => {
            $scope.$settings.map.isReady = true;
        }, 100);
    };
    // Blur Layer อื่นๆ ยกเว้น layer ที่ active อยู่
    var lastBlurLayerOpacity = 1;
    const blurOtherLayerExceptActive = (opacity) => {
        if(lastBlurLayerOpacity === opacity) return;
        const workLayer = activeLayer();
        for (var i = 0; i < $scope.$settings.map.mapLayers.length; i++) {
            var layer = $scope.$settings.map.mapLayers[i];
            layer.opacity = layer.id !== workLayer.id ? opacity : 1;
        }
        $scope.updateMap();
        lastBlurLayerOpacity = opacity;
    };
    // เปิดใช้งาน ยางลบ
    $scope.activeEraser = () => {
        if(!$scope.$settings.map.isReady) return;
        $scope.$settings.formView.eraserTile.visible = !$scope.$settings.formView.eraserTile.visible;
        if(!$scope.$settings.formView.eraserTile.visible)
            $scope.$settings.formView.eraserTile.enable = false;
        else // ซ่อน Tile ที่เลือก
            $scope.$settings.formView.selectedTile.visibleOnScreen = false;
    };
    // ปรับขนาดของ Eraser
    $scope.eraserSize = (newSizeStr) => {
        $scope.$settings.formView.eraserTile.newSizeByStr(newSizeStr);
    };
    // แสดงเครื่องมือปรับขนาดของ Eraser
    var toggleEraserSizeTimeoutId = null;
    $scope.toggleEraserSize = (enable, immediate) => {
        $timeout.cancel(toggleEraserSizeTimeoutId);

        if(!enable){
            if(immediate){
                $scope.$settings.eraserResizeVisible = false;
                return;
            }

            toggleEraserSizeTimeoutId = $timeout(() => {
                $scope.$settings.eraserResizeVisible = false;
            }, 900);
        }
        else $scope.$settings.eraserResizeVisible = true;
    };
    // แสดง/ซ่อน คุณสมบัติแผนที่
    var toggleMapPropertyTimeoutId = null;
    $scope.toggleMapProperty = (enable, immediate) => {
        $timeout.cancel(toggleMapPropertyTimeoutId);
        if(!$scope.$settings.map.isReady) return;

        if(!enable){
            if($scope.$settings.formView.resizingMapProperty) return;
            if(immediate){
                $scope.$settings.formView.visibleMapProperty = false;
                return;
            }

            toggleMapPropertyTimeoutId = $timeout(() => {
                $scope.$settings.formView.visibleMapProperty = false;
            }, 1800);
        }else{
            $scope.$settings.formView.visibleMapProperty = true;
        }
    };
    //=========================================================
    //
    //=========================================================





    // จัดการ tileset ของแผนที่
    var tilesetCtx = document.getElementById('tilesetCanvas').getContext('2d');
    /**
     * 1. วาดรูปภาพของ Tileset ที่ถูกเลือกในหน้าจอ ลงบน Canvas
     * 2. แสดง Grid
     * 3. แสดง รายการ Tileset ที่เลือกไว้
     */
    const drawTileset = () => {
        $tileMapService.clearAllRect(tilesetCtx);

        const selectedTileset = $scope.$settings.formView.selectedTileset;
        if(selectedTileset.ctx === undefined) return;

        tilesetCtx.canvas.width = selectedTileset.ctx.canvas.width;
        tilesetCtx.canvas.height = selectedTileset.ctx.canvas.height;
        tilesetCtx.drawImage(selectedTileset.ctx.canvas, 0, 0);

        // วาดแสดงรายการ Tile ที่ถูกเลือก
        if($scope.$settings.formView.selectedTile.hasTile()){
            var tileProps = $scope.$settings.formView.selectedTile.getTileInfo();
            //console.log(`${JSON.stringify(tileProps)}`);

            // วาดเส้นกรอบคลุม Tile ที่ถูกเลือก
            tilesetCtx.lineWidth = 2;
            tilesetCtx.strokeStyle = '#000000';
            tilesetCtx.strokeRect(tileProps.dx, tileProps.dy, tileProps.width, tileProps.height);
            tilesetCtx.resetTransform();

            // เทสีคลุม tile ที่ถูกเลือก
            tilesetCtx.globalAlpha = 0.5;
            tilesetCtx.fileStyle = '#28a745';
            tilesetCtx.fillRect(tileProps.dx, tileProps.dy, tileProps.width, tileProps.height);
            tilesetCtx.resetTransform();

            // เขียนข้อมูลภาพลงบน Canvas เพื่อให้ภาพเลื่อนตามเม้าส์
            $scope.$settings.formView.selectedTile.drawTile(tilesetCtx);
        }

        //$tileMapService.drawGrid(tilesetCtx, Math.floor(tilesetCtx.canvas.width / selectedTileset.tilewidth), Math.floor(tilesetCtx.canvas.height / selectedTileset.tileheight));
    };
    $scope.selectedTileset = () => {
        $scope.$settings.formView.selectedTile.clear();
        $timeout(drawTileset(), 100);
    };
    tilesetCtx.canvas.addEventListener('mousedown', (e) => {
        $scope.$settings.formView.tilesetSelectStart = true;

        const point = mousePosOnCanvas(tilesetCtx.canvas, e);
        const mapPos = seekMapPosByPoint(point);
        $scope.$settings.formView.selectedTile.clear().addTile($scope.$settings.formView.selectedTileset, mapPos);
        drawTileset();
    });


    // จัดการข้อมูล Layer
    const activeLayer = () => {
        var activeLayers = $scope.$settings.map.mapLayers.filter((item) => { return item.isActive; });
        return activeLayers[0] || null;
    };
    $scope.setActiveLayer = (layer) => {
        for(var i = 0;i<$scope.$settings.map.mapLayers.length;i++)
            $scope.$settings.map.mapLayers[i].isActive = layer.id === $scope.$settings.map.mapLayers[i].id;
        
        $scope.$settings.formView.activeLayer = activeLayer();
        lastBlurLayerOpacity = null;
    };
    $scope.toggleVisibleLayer = (layer) => {
        if(!$scope.$settings.map.isReady) return;

        if(layer){
            layer.visible = !layer.visible;
        }else{
            layer = activeLayer();
            for(var i=0;i<$scope.$settings.map.mapLayers.length;i++){
                var curLayer = $scope.$settings.map.mapLayers[i];
                curLayer.visible = !curLayer.visible || layer.id === curLayer.id;
            }
        }

        $timeout($scope.updateMap(), 100);
    };


}).run(($rootScope) => {
    $rootScope.$appSetting = {
        api: {
            //baseRoute: 'http://localhost:3000/api/map-editor'
            baseRoute: 'https://fw-map-editor.herokuapp.com/api/map-editor'
        }
    };
}).service('$fileReaderService', function ($q, $dialogService) {
    this.doUpload = function (e, fileExts, fileMBMaxSize) {
        return $q(function (resolve, reject) {
            var fileBytes = fileMBMaxSize * 1024 * 1024;
            if (($.trim(fileExts).length > 0 && !eval(`/(${fileExts.replace(/\,\t*/ig, '|')})$/ig`).test(e.target.files[0].name)) || fileBytes < e.target.files[0].size) {
                $dialogService.danger(e, `รองรับเฉพาะไฟล์ ${fileExts||'ทุกประเภท'} และ ขนาดไม่เกิน ${fileMBMaxSize} เมกาไบท์`);
                reject();
                return;
            }

            var reader = new FileReader();
            reader.onload = function (e) {
                resolve(e.target.result);
            };
            reader.readAsDataURL(e.target.files[0]);
        });
    };
}).service('$dialogService', function () {
    this.danger = (e, text, title) => {
        alert(text);
    };
}).service('$tilesetService', function ($customHttp, $q, $rootScope) {
    var _this = this;

    /**
     * โหลดไฟล์รูปภาพของ Tileset
     * @param {*} tilesetName       string ชื่อไฟล์รูปภาพของ tileset 
     * @returns                     string data:[mime_type];base64, xxxx
     */
    this.syncTileset = (tilesetName) => {
        return $q((resolve) => {
            $customHttp.formGet(`${$rootScope.$appSetting.api.baseRoute}/getFileData/tileset/${tilesetName}`, {}, null).then((res) => {
                if(res.status !== 200)
                    resolve(null);
                else
                    resolve(res.data.fileData || null);
            }, () => {
                resolve(null);
            });
        });
    };

    /**
     * โหลดไฟล์รูปภาพของ Tileset ส่งมาได้มากกว่า 1 tileset
     * @param {*} tilesetNames      array string
     * @returns  { tilesetname: filedata (data:[mime_type];base64, xxx) }
     */
    this.syncTilesets = (tilesetNames) => {
        var synCount = 0;
        var tilesetCount = (tilesetNames || []).length;
        var ret = {};
        return $q((resolve) => {
            angular.forEach(tilesetNames || [], (tilesetName) => {
                _this.syncTileset(tilesetName).then((fileData) => {
                    synCount++;
                    ret = $.extend(ret, {
                        "`${tilesetName}`": fileData
                    });
                    if (synCount >= tilesetCount)
                        resolve(ret);
                });
            });
        });
    };


    /**
     * แปลงข้อมูล base64 data ที่ได้จากการอัพโหลดไฟล์
     * ให้เป็นข้อมูล json object
     */
    this.syncConvertFileData = (base64FileData) => {
        return $q((resolve) => {
            $customHttp.bodyPost(`${$rootScope.$appSetting.api.baseRoute}/strEncoder/decode`, {
                data: base64FileData
            }).then((res) => {
                resolve(res.data || null);
            }, () => {
                resolve(null);
            });
        });
    };
}).service('$tileMapService', function ($q) {
    var _this = this;
    const TILE_ROTATE_START_NUM = 2684354560;
    const TILE_LOCAL_ID_NUM = 536870912;
    const TILE_FLIP_HORIZONTAL_NUM = 2147483648;
    
    const FLIP_ROTATE_VAL = 'anti-diagonal';
    const FLIP_HORIZONTAL_VAL = 'horizontal';
    const FLIP_VERTICAL_VAL = 'vertical';
    const flipProps = (flipType, angle) => {
        return { flipType: flipType || null, angle: angle || null };
    };
    const seekTileset = (imageIndex) => {
        var tileset = _this.tileMapJson.tilesets.filter(function (tileset) {
            return imageIndex >= tileset.firstgid && imageIndex <= ((tileset.tilecount + tileset.firstgid) - 1);
        });
        return tileset[0] || null;
    };
    const defaultOpts = {
        tile: {
            defaultWidth: 32,
            defaultHeight: 32
        }
    };

    const MapLayerCls = function () {
        const updateTiles = () => {
            for (var i = 0; i < this.tiles.length; i++) {
                this.tiles[i].layer = this;
            }
        };

        this.id = null;
        this.name = null;
        this.type = null;
        this.opacity = 0;
        this.index = null; // ตำแหน่งของ layer ใน Map json file
        this.visible = false;
        this.isNew = false;
        this.isActive = false;
        // สร้างจำนวน Tile Array เท่ากับ กว้าง x ยาว ของแผนที่
        this.tiles = [];
        const count = tileMapJson.width * tileMapJson.height;
        for(var i=0;i<count;i++)
            this.tiles.push(new MapTileCls());

        this.initLayer = (layerId, layerName, layerType, opacity, layerIndex, visible, isNew) => {
            this.id = layerId || null;
            this.name = layerName || null;
            this.type = layerType || null;
            this.opacity = opacity || 1;
            this.index = layerIndex === undefined ? null : layerIndex;
            this.visible = visible === undefined ? false : visible;
            this.isNew = isNew === undefined ? false : isNew; // true = เป็นการสร้าง Layer ใหม่ระหว่างการแก้ไข แผนที่
            this.isActive = false;

            updateTiles();
            return this;
        };

        /**
         * คำนวณตำแหน่งของ Tile data index จาก columnindex & rowindex
         * @param {*} colIndex       ค่าเริ่มจาก 0
         * @param {*} rowIndex       ค่าเริ่มจาก 0
         */
        this.getTileIndexBy = (colIndex, rowIndex) => {
            const mapWidth = _this.tileMapJson.width; // จำนวนคอลัมล์ในแผนที่ในแต่ละแถว
            return rowIndex * mapWidth + colIndex;
        };

        /**
         * แปลงข้อมูล Tile ให้อยู่ในรูปแบบ Array
         * จะใช้ layerImageIndex เป็นข้อมูลในการสร้าง Array แต่ละ Element
         * @returns 
         */
        this.toLayerData = () => {
            return this.tiles.map((tile) => { return tile.layerImageIndex; });
        };

        /**
         * ปรับปรุงข้อมูล tile ใน  Layer
         * @param {*} colIndex              ค่าเริ่มจาก 0      ตำแหน่งคอลัมล์ในแผนที่
         * @param {*} rowIndex              ค่าเริ่มจาก 0      ตำแหน่งแถวในแผนที่
         * @param {*} layerImageIndex       ตำแหน่งของภาพใน  tileset ที่คำนวณค่าการ flip & rotate มาแล้ว
         * @param {*} arImageData           Uint8ClampArray ที่ได้จาก getImageData
         */
        this.updateTileBy = (colIndex, rowIndex, layerImageIndex, arImageData) => {
            if(colIndex < 0 || rowIndex < 0) return;
            var tileIndex = this.getTileIndexBy(colIndex, rowIndex);
            var tileItem = this.tiles[tileIndex];
            tileItem.flipTypeProps = _this.getTileFlipType(layerImageIndex);

            var tileCachedItem = null;
            if(layerImageIndex > 0 && null === (tileCachedItem = _this.tileImagesCached[layerImageIndex] || null)){
                tileCachedItem = new TileImageCached(null, arImageData, tileItem.flipTypeProps);
                tileCachedItem.canvas = _this.convertImageDataToImageObject(tileCachedItem.arImageData, _this.tileMapJson.tilewidth, _this.tileMapJson.tileheight, tileItem.flipTypeProps);
                _this.tileImagesCached[layerImageIndex] = tileCachedItem;
            }

            
            tileItem.layerImageIndex = layerImageIndex;
            tileItem.imageIndex = _this.getTileLocalId(layerImageIndex);
            tileItem.tileset = seekTileset(tileItem.imageIndex);
            tileItem.imageData = arImageData;
            
            // คำนวณตำแหน่ง Tile บนแผนที่
            tileItem.point = _this.getPointBy(tileIndex + 1, _this.tileMapJson.width, _this.tileMapJson.tilewidth);
            tileItem.visible = tileCachedItem !== null;
            tileItem.canvas = tileCachedItem ? tileCachedItem.canvas : null;

            // Update การเปลี่ยนแปลง Map เฉพาะ tile
            // ก่อนการเขียนค่า Tile เข้าไปใหม่ Clear Rect (ทำให้พื้นที่เป็น Transpacency) หากไม่ Clear จะทำให้เขียนภาพทับลงไป สีจะเข้มขึ้น
            _this.ctx.clearRect(tileItem.point.dx, tileItem.point.dy, _this.tileMapJson.tilewidth, _this.tileMapJson.tileheight);
            //_this.ctx.putImageData(_this.createEmptyImg(_this.tileMapJson.tilewidth, _this.tileMapJson.tileheight), tileItem.point.dx, tileItem.point.dy);
            if (layerImageIndex > 0) {
                _this.ctx.save(); // Save canvas default option 
                _this.ctx.globalCompositeOperation = 'source-over'; // ให้เขียนภาพไว้บน ตัวที่มีอยู่ใน Canvas (SendToTop)
                _this.ctx.globalAlpha = this.opacity;
                tileItem.drawToMap();
                _this.ctx.restore(); // restore canvas option to default
            }
        };

        //this.initLayer(layerName, layerType, layerIndex, visible, isNew);
    };
    const MapTileCls = function () {
        this.layer = null; // Tile นี่อยู่ใน Layer ใด
        this.layerImageIndex = null; // ตำแหน่งรูปภาพที่ได้จาก map json

        this.tileset = null;
        this.imageIndex = null; // ตำแหน่งรูปภาพบน tileset ซึ่งผ่านการ คำนวรโดย getTileLocalId เพื่อหาตำแหน่งที่แท้จริง Tileset
        this.flipTypeProps = []; // const flipProps
        this.imageData = null; // imageData ที่ได้จาก getImageData ใน tileset

        this.point = null; // ตำแหน่ง x,y ที่จะวาลงบนแผนที่
        this.canvas = null; // ข้อมูล 
        this.visible = false;
        this.drawToMap = () => {
            if (!this.visible)
                return;

            this.canvas = this.canvas || _this.tileImagesCached[this.layerImageIndex].canvas;
            _this.ctx.drawImage(this.canvas, this.point.dx, this.point.dy);

            return this;
        }

        this.initTile = (layer, layerImageIndex, imageIndex, tileset, flipTypeProps, arImageData, point, visible) => {
            this.layer = layer;
            this.layerImageIndex = layerImageIndex;

            this.tileset = tileset;
            this.imageIndex = imageIndex;
            this.flipTypeProps = flipTypeProps;
            this.imageData = arImageData;

            this.point = point;
            this.visible = visible;

            return this;
        };
    };
    const TileImageCached = function(canvas, tileImageData, flipTypeProps){
        this.canvas = canvas || null;
        this.arImageData = tileImageData || null;
        this.flipTypeProps = flipTypeProps || null;
    };
    

    _this.ctx = null;
    _this.tileMapJson = null;
    // รายการ Layer ของแผนที่ (MapLayerCls)
    _this.mapLayers = [];
    // เก็บตำแหน่งของภาพใน Tile ที่ซ้ำกันไว้ เพื่อรวมไว้โหลดลง Memory ในคราวเดียว 
    // ลดการโหลดรูปภาพในตำแหน่งเดียวกันหลายๆ ครั้ง
    _this.tileImagesCached = {};
    this.init = function (ctx, tileMapJson) {
        _this.ctx = ctx ? ctx : _this.createContext2d(32, 32);
        _this.tileMapJson = tileMapJson;
        _this.mapLayers = [];
        _this.tileImagesCached = {};

        _this.ctx.canvas.width = tileMapJson.width * tileMapJson.tilewidth;
        _this.ctx.canvas.height = tileMapJson.height * tileMapJson.tileheight;

        return _this.readMap();
    }

    this.clearAllRect = (ctx) => {
        if(!ctx) return;
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    };

    /**
     * ปรับปรุงการเปลี่ยนแปลงข้อมูล Layer เข้าไปในแผนที่
     */
    this.updateMap = () => {
        for(var i = 0;i<this.mapLayers.length;i++){
            const layer = this.mapLayers[i];
            _this.tileMapJson.layers[layer.index].data = layer.toLayerData();
        }
    };

    /**
     * สร้างรูปภาพที่เป็น Transpacency ตามขนาดที่กำหนด
     * จะได้ข้อมูลออกไปเป็น Uint8ClampArray หรือโครงสร้างเดียวกับ getImageData
     * @param {*} width   ความกว้างของภาพ
     * @param {*} height  ความสูงของภาพ
     */
    this.createEmptyImg = (width, height) => {
        var img = this.ctx.createImageData(width, height);
        // for(var i = img.data.length;i<=0;i--)
        //     img.data[i] = 0;
        return img;
    };

    this.cloneContext = (source, target) => {
        if(!source || !target) return;

        _this.clearAllRect(target);
        target.canvas.width = source.canvas.width;
        target.canvas.height = source.canvas.height;
        target.drawImage(source.canvas, 0, 0);
    };

    this.getMapLayers = () => {
        return _this.mapLayers;
    };


    /**
     * หา ColumnIndex, RowIndex ของ tileset
     * เพื่อระบุตำแหน่ง x, y
     * @param {*} index             int ตำแหน่งของภาพใน Tileset ค่าเริ่มต้นที่ผ่านเข้ามาจะเริ่มจาก 1 (ภาพแต่ละชิ้นจะขนาด 32 x 32)
     * @param {*} tileCount         int จำนวนกล่องขนาด 32 x 32 เมื่อคำนวณกับความยาวของภาพ (width) แล้วได้ค่าเท่าไหร่
     * @param {*} tileWidth         int ความความกว้างของกล่อง ค่า Default เป็น 32
     * @returns                     object "{dx: xxx, dy: xxx}"
     */
    this.getPointBy = function (index, tileCount, tileWidth) {
        var colIndex = index % tileCount;
        var rowIndex = Math.floor(index / tileCount) + 1;
        if (colIndex === 0) {
            // หารแล้วได้เศษ 0 แสดงว่า ตำแหน่งรูปภาพ เท่ากับ จำนวนคอลัมล์ใน Tileset
            colIndex = tileCount;
            rowIndex -= 1;
        }
        return {
            dx: colIndex * tileWidth - tileWidth,
            dy: rowIndex * tileWidth - tileWidth
        };
    };

    /**
     * แปลงข้อมูล image index ที่อยู่ใน layer
     * ให้เป็นตำแหน่งรูปภาพที่แท้จริงของ Tileset
     * @param {*} imageIndex 
     * @returns 
     */
    this.getTileLocalId = (imageIndex) => {
        //return imageIndex & ~(-536870912);
        return imageIndex % TILE_LOCAL_ID_NUM;
    };

    /**
     * รูปแบบการ พลิกรูปภาพของ Tile (horizontal, veritical, anti-diagonal)
     * @param {*} imageIndex 
     * @returns  array - flipProps
     */
    this.getTileFlipType = (imageIndex) => {
        var flipTypes = [];

        // คำนวณค่าการ Rotate
        var tileId = _this.getTileLocalId(imageIndex);
        //var rotate270DegreeVal = Math.round(((rotate180DegreeVal = (rotate90DegreeVal = TILE_ROTATE_START_NUM + tileId) + TILE_LOCAL_ID_NUM) + tileId) / 2);
        var rotate270DegreeVal = _this.flipTypesToImageIndex([flipProps(FLIP_ROTATE_VAL, 270)], tileId);
        var rotate180DegreeVal = _this.flipTypesToImageIndex([flipProps(FLIP_ROTATE_VAL, 180)], tileId);
        var rotate90DegreeVal = _this.flipTypesToImageIndex([flipProps(FLIP_ROTATE_VAL, 90)], tileId);
        if (rotate90DegreeVal === imageIndex)
            flipTypes.push(flipProps(FLIP_ROTATE_VAL, 90));
        else if (rotate180DegreeVal === imageIndex)
            flipTypes.push(flipProps(FLIP_ROTATE_VAL, 180));
        else if (rotate270DegreeVal === imageIndex)
            flipTypes.push(flipProps(FLIP_ROTATE_VAL, 270));

        // คำนวน การ Rotate & Flip
        //var rotate270DegreeFlipHorizontal = (rotate180DegreeFlipVertical = (rotate90DegreeFlipHorizontalVal = TILE_LOCAL_ID_NUM + tileId) + TILE_LOCAL_ID_NUM) + TILE_ROTATE_START_NUM;
        var rotate270DegreeFlipVertical = _this.flipTypesToImageIndex([flipProps(FLIP_ROTATE_VAL, 270), flipProps(FLIP_VERTICAL_VAL)], tileId);
        var rotate180DegreeFlipHorizontal = _this.flipTypesToImageIndex([flipProps(FLIP_ROTATE_VAL, 180), flipProps(FLIP_HORIZONTAL_VAL)], tileId);
        var rotate90DegreeFlipHorizontalVal = _this.flipTypesToImageIndex([flipProps(FLIP_ROTATE_VAL, 90), flipProps(FLIP_HORIZONTAL_VAL)], tileId);
        if(imageIndex === rotate90DegreeFlipHorizontalVal){
            flipTypes.push(flipProps(FLIP_ROTATE_VAL, 90));
            flipTypes.push(flipProps(FLIP_HORIZONTAL_VAL));
        }else if(imageIndex === rotate180DegreeFlipHorizontal){
            flipTypes.push(flipProps(FLIP_ROTATE_VAL, 180));
            flipTypes.push(flipProps(FLIP_HORIZONTAL_VAL));
        }else if(imageIndex === rotate270DegreeFlipVertical){
            flipTypes.push(flipProps(FLIP_ROTATE_VAL, 270));
            flipTypes.push(flipProps(FLIP_VERTICAL_VAL));
        }

        //var flipHorizontal = TILE_FLIP_HORIZONTAL_NUM + tileId;
        var flipHorizontal =  _this.flipTypesToImageIndex([flipProps(FLIP_HORIZONTAL_VAL)], tileId);
        if(imageIndex === flipHorizontal)
            flipTypes.push(flipProps(FLIP_HORIZONTAL_VAL));

        //console.log(`${JSON.stringify(flipTypes)}`);
        return flipTypes;
    };
    /**
     * สร้าง ประเภทของการ Flip Implement สำหรับให้ภายนอก Service เรียกสร้าง Flip ได้
     * เพื่อเอื้อ ต่อการเรียกใช้งาน method rotateAndFlipImage
     * @param {*} flipType  เรียกใช้ getRotateFlipTypeVal(), getHorizontalFlipTypeVal()
     * @param {*} angle     กรณี  getRotateFlipType จะมี 90, 180, 270
     */
    this.createFlipType = (flipType, angle) => {
        return flipProps(flipType, angle);
    };
    this.getRotateFlipTypeVal = () => {
        return FLIP_ROTATE_VAL;
    };
    this.getHorizontalFlipTypeVal = () => {
        return FLIP_HORIZONTAL_VAL;
    };
    this.getVerticalFlipTypeVal = () => {
        return FLIP_VERTICAL_VAL;
    };

    /**
     * แปลงข้อมูลรูปภาพที่ถูก Flip ให้เป็น ImageIndex เพื่อเขียนลง layer data
     * @param {*} flipTypes array รูปแบบของการ Flip
     * @param {*} tileId    ตำแหน่งรูปภาพบน Tileset
     */
    this.flipTypesToImageIndex = (flipTypes, tileId) => {
        if(flipTypes.length === 0) return tileId;

        // คำนวณค่าการ Rotate
        var rotate270DegreeVal = Math.round(((rotate180DegreeVal = (rotate90DegreeVal = TILE_ROTATE_START_NUM + tileId) + TILE_LOCAL_ID_NUM) + tileId) / 2);
        // คำนวน การ Rotate & Flip
        var rotate270DegreeFlipVertical = (rotate180DegreeFlipHorizontal = (rotate90DegreeFlipHorizontalVal = TILE_LOCAL_ID_NUM + tileId) + TILE_LOCAL_ID_NUM) + TILE_ROTATE_START_NUM;
        // Flip แนวนอน
        var flipHorizontal = TILE_FLIP_HORIZONTAL_NUM + tileId;

        if (flipTypes.length === 1) {
            // จะประกอบด้วย rotate || horizontal
            var flipProps = flipTypes[0];
            if (flipProps.flipType === FLIP_HORIZONTAL_VAL) 
                return flipHorizontal;

            if (flipProps.flipType === FLIP_ROTATE_VAL) {
                if (flipProps.angle === 90) return rotate90DegreeVal; 
                if (flipProps.angle === 180) return rotate180DegreeVal; 
                if (flipProps.angle === 270) return rotate270DegreeVal;
            }
        } else {
            // จะประกอบด้วย rotate & flip Horizontal
            var angle = flipTypes[0].angle,
                flipType = flipTypes[1].flipType;
            if (angle === 90 && flipType === FLIP_HORIZONTAL_VAL) return rotate90DegreeFlipHorizontalVal;
            if (angle === 180 && flipType === FLIP_HORIZONTAL_VAL) return rotate180DegreeFlipHorizontal; 
            if (angle === 270 && flipType === FLIP_VERTICAL_VAL) return rotate270DegreeFlipVertical;
        }
    };

    /**
     * พลิกรูปภาพ และ หมุนภาพ (90, 180, 270)
     * @param {*} inMemCanvas   HtmlCanvas
     * @param {*} flipTypes     ค่าที่ได้จาก getTileFlipType()
     * @returns InMemory - Canvas
     */
    this.rotateAndFlipImage = (inMemCanvas, flipTypes) => {
        var isHorizontalRotate = flipTypes.filter((item) => { return item.angle === 90 || item.angle === 270; }).length > 0;
        var ctx = _this.createContext2d(isHorizontalRotate ? inMemCanvas.height : inMemCanvas.width, isHorizontalRotate ? inMemCanvas.width : inMemCanvas.height);
        const calAngle = (angle) => {
            return angle * (Math.PI / 180);
        };

        if (flipTypes.length === 1) {
            // จะประกอบด้วย rotate || horizontal
            var flipProps = flipTypes[0];

            if (flipProps.flipType === FLIP_HORIZONTAL_VAL) {
                ctx.translate(ctx.canvas.width, 0);
                ctx.scale(-1, 1);
            }

            if (flipProps.flipType === FLIP_ROTATE_VAL) {
                var translateX = translateY = 0;
                if (flipProps.angle === 90) translateX = ctx.canvas.width;
                else if (flipProps.angle === 180) {
                    translateX = ctx.canvas.width;
                    translateY = ctx.canvas.height;
                } else if (flipProps.angle === 270) translateY = ctx.canvas.height;

                ctx.translate(translateX, translateY);
                ctx.rotate(calAngle(flipProps.angle));
            }
        } else if(flipTypes.length === 2) {
            // จะประกอบด้วย rotate & flip Horizontal
            var angle = flipTypes[0].angle,
                flipType = flipTypes[1].flipType;
            if (angle === 90 && flipType === FLIP_HORIZONTAL_VAL) {
                ctx.translate(0, 0);
                ctx.scale(-1, 1);
                ctx.rotate(calAngle(angle));
            } else if (angle === 180 && flipType === FLIP_HORIZONTAL_VAL) {
                ctx.translate(0, ctx.canvas.height);
                ctx.scale(-1, 1);
                ctx.rotate(calAngle(angle));
            } else if (angle === 270 && flipType === FLIP_VERTICAL_VAL) {
                ctx.translate(ctx.canvas.width, ctx.canvas.height);
                ctx.rotate(calAngle(angle));
                ctx.scale(1, -1);
            }
        }else{
            ctx.translate(0,0);
            ctx.rotate(0);
            ctx.scale(1,1);
        }

        ctx.drawImage(inMemCanvas, 0, 0);
        ctx.resetTransform();
        return ctx.canvas;
    };

    /**
     * แปลงข้อมูล Base64Data ของรูปภาพให้เป็น Image Object
     * @param {*} base64Data        ข้อมูล base64 ของรูปภาพ ที่ต้องการแปลงให้เป็น Image Object
     * @returns 
     */
    this.getImageBy = function (base64Data) {
        return $q(function (resolve) {
            var img = new Image();
            img.onload = function () {
                resolve(img);
            };
            img.src = base64Data;
        });
    };

    /**
     * สร้าง Context 2d ของ Canvas
     * @param {*} defaultWidth      ค่าเริ่มต้น ความยาว
     * @param {*} defaultHeight     ค่าเริ่มต้น ความสูง
     * @returns context 2d
     */ 
    this.createContext2d = function (defaultWidth, defaultHeight) {
        var retCtx = $('<canvas></canvas>')[0].getContext('2d');
        retCtx.canvas.width = defaultWidth || defaultOpts.tile.defaultWidth;
        retCtx.canvas.height = defaultHeight || defaultOpts.tile.defaultHeight;

        // Clear พื้นที่ทั้งหมดของ Canvas ให้เป็นพื้นที่ว่างเปล่า เพื่อเตรียมใช้งาน
        // พื้นหลังของ canvas จะ default ที่ transparency
        retCtx.clearRect(0, 0, retCtx.canvas.width, retCtx.canvas.height);
        return retCtx;
    };

    /**
     * แปลง ImageData ที่ได้จากการ getImageData (ซึ่งข้อมูที่ได้จะเป็น  Uint8ClampArray)
     * 
     * @param {*} arImgData     Uint8ClampArray หรือ ข้อมูลของสีในแต่ละ pixel (4 byte, R,G,B,A)
     * @param {*} toWidth       ความกว้างของรูปภาพที่ต้องการ หลังจากแปลงเป็น ImageObject
     * @param {*} toHeight      ความสูงของรูปภาพที่ต้องการ หลังจากแปลงเป็น ImageObject
     * @param {*} flipTypeProps null = no flip, [anti-diagonal ค่านี้จะมี angle มาด้วย, horizontal, vertical]
     * @returns     Inmemory - canvas
     */
    this.convertImageDataToImageObject = (arImgData, toWidth, toHeight, flipTypeProps) => {
        // var count = 0;
        // do{
        //     if(arImgData[count] === 255 && arImgData[count+1] === 255 && arImgData[count+2] === 255)
        //         arImgData.data[count + 3] = 0; // 
        //     count += 4;
        // }while(count <= arImgData.data.length);

        // เขียน arImgData ลงบน Canvas เพื่ออาศัยความสามารถของ Canvas
        // แปลงข้อมูลที่อยู่บน Canvas ให้เป็น Base64Data 
        // สำหรับส่งข้อมูลให้ ImageData
        var ctx = _this.createContext2d(toWidth, toHeight);
        ctx.putImageData(arImgData, 0, 0);
        return flipTypeProps.length === 0 ? ctx.canvas : _this.rotateAndFlipImage(ctx.canvas, flipTypeProps);
    };

    /**
     * วาด Grid ลงบนแผนที่
     */
    this.drawGrid = (targetCtx, mapWidth, mapHeight, tileWidth, tileHeight) => {
        targetCtx = targetCtx || _this.ctx;
        mapWidth = mapWidth || _this.tileMapJson.width;
        mapHeight = mapHeight || _this.tileMapJson.height;
        tileWidth = tileWidth || defaultOpts.tile.defaultWidth;//_this.tileMapJson.tilewidth;
        tileHeight = tileHeight || defaultOpts.tile.defaultHeight;//_this.tileMapJson.tileheight;

        // เส้นแนวตั้ง ซ้าย
        var ctx = _this.createContext2d(tileWidth, tileHeight);
        ctx.strokeStyle = 'rgba(0,0,0,1)';
        ctx.lineWidth = 0.9;
        ctx.setLineDash([4, 4]);
        ctx.moveTo(0,0);
        ctx.lineTo(0, tileHeight);
        ctx.stroke();
        ctx.resetTransform();
        
        // แส้นแนวนอน ด้านบน
        var canvasLineTopHorizontal = _this.rotateAndFlipImage(ctx.canvas, [flipProps(FLIP_ROTATE_VAL, 90)]);
        // แส้นแนวนอน ด้านล่าง
        var canvasLineBottomHorizontal = _this.rotateAndFlipImage(ctx.canvas, [flipProps(FLIP_ROTATE_VAL, 270)]);
        // แส้นแนวตั้ง ขวา
        var canvasFlipHorizontal = _this.rotateAndFlipImage(ctx.canvas, [flipProps(FLIP_HORIZONTAL_VAL)]);


        targetCtx.save();
        targetCtx.globalCompositeOperation = 'source-over'; // ให้ Grid อยู่บนภาพ
        var dx = dy = 1;
        do {
            dx = 1;
            do {
                targetCtx.drawImage(ctx.canvas, dx * tileWidth - tileWidth, dy * tileHeight - tileHeight);
                targetCtx.drawImage(canvasLineTopHorizontal, dx * tileWidth - tileWidth, dy * tileHeight - tileHeight);

                // แถวสุดท้าย ให้วาดเส้นด้านล่าง
                if(dy === mapHeight)
                    targetCtx.drawImage(canvasLineBottomHorizontal, dx * tileWidth - tileWidth, dy * tileHeight - tileHeight);

                dx++;
            } while (dx <= mapWidth);
            // จบแต่ละแถว วาดเส้นขวาปิด
            targetCtx.drawImage(canvasFlipHorizontal, --dx * tileWidth - tileWidth, dy * tileHeight - tileHeight);
            
            dy++;
        } while (dy <= mapHeight);
        targetCtx.restore();
    };


    /**
     * วาดข้อมูลแผนที่จากไฟล์ ลงบน Html Canvas
     * @param {*} enableGrid    true|undefined วาด Grid
     */
    this.drawMap = (enableGrid) => {
        for (var i = 0; i < _this.mapLayers.length; i++){
            var layer = _this.mapLayers[i];
            if(!layer.visible) continue;

            _this.ctx.save(); // Save canvas default option 
            _this.ctx.globalCompositeOperation = 'source-over'; // ให้เขียนภาพไว้บน ตัวที่มีอยู่ใน Canvas (SendToTop)
            _this.ctx.globalAlpha = layer.opacity;
            for(var x = 0; x < layer.tiles.length; x++)
                layer.tiles[x].drawToMap();
            _this.ctx.restore(); // restore canvas option to default
        }

        // วาด grid ลงบนแผนที่
        if(!enableGrid || enableGrid === true)
            _this.drawGrid();
    };
    /**
     * อ่านข้อมูลในแผนที่ ตาม layer data และวาดลงบนแผนที่
     * @returns 
     */
    this.readMap = function () {
        return $q((resolve) => {

            for (var i = 0; i < _this.tileMapJson.layers.length; i++) {
                var layer = _this.tileMapJson.layers[i];
                if (!layer.data) continue;

                var layerItem = new MapLayerCls().initLayer(layer.id, layer.name, layer.type, layer.opacity, i, layer.visible, false);

                for (var x = 0; x < layer.data.length; x++) {
                    var columnIndex = x;
                    var layerImageIndex = layer.data[x];
                    var tileItem = layerItem.tiles[columnIndex];
                    var mapPoint = _this.getPointBy(columnIndex + 1, _this.tileMapJson.width, _this.tileMapJson.tilewidth);
                    tileItem.point = mapPoint;
                    tileItem.layerImageIndex = layerImageIndex;
                    if (layerImageIndex === 0) 
                        continue;

                    var flipTypeProps = _this.getTileFlipType(layerImageIndex);
                    var tileImageIndex = _this.getTileLocalId(layerImageIndex);
                    tileItem.flipTypeProps = flipTypeProps;

                    // ค้นหา Tileset ตามตำแหน่งรูปภาพที่เขียนใน data property ของแต่ละ Layer
                    // เพื่อหา Tileset สำหรับ cut ข้อมูลรูปภาพเขียนลงบน Canvas ตามขนาด 32 x 32 pixel
                    var tileset = seekTileset(tileImageIndex);//_this.tileMapJson.tilesets.filter(function (tileset) {
                    //    return tileImageIndex >= tileset.firstgid && tileImageIndex <= ((tileset.tilecount + tileset.firstgid) - 1);
                    //});
                    if (null === tileset) {
                        console.log(`No Tileset: Layer: ${layer.name}, tileImageIndex: ${tileImageIndex}`);
                        continue;
                    }
                    tileItem.tileset = tileset;


                    // ตำแหน่งรูปภาพจะถูก Running ตัวเลขไปตามจำนวน Tileset 
                    // และใน Tileset จะบอกตำแหน่งเริ่มต้นของรูปภาพ ซึ่งจะต่อจาก Tileset ก่อนหน้า
                    // ดังนั้น หากต้องการตำแหน่งของภาพใน Tileset ที่แท้จริง ต้องลบ ("firstgid" - 1) ออกก่อน
                    tileImageIndex = tileImageIndex - (tileset.firstgid - 1);
                    var point = _this.getPointBy(tileImageIndex, tileset.columns, tileset.tilewidth);
                    // หาพิกัดของรูปภาพบน Tileset ตาม tileImageIndex
                    var tileImageData = tileset.ctx.getImageData(point.dx, point.dy, tileset.tilewidth, tileset.tileheight);

                    if(!_this.tileImagesCached[layerImageIndex])
                        _this.tileImagesCached[layerImageIndex] = new TileImageCached(null, tileImageData, flipTypeProps);
                    
                    tileItem.imageIndex = tileImageIndex;
                    tileItem.imageData = tileImageData;
                    tileItem.visible = true;
                }

                _this.mapLayers.push(layerItem);
            }

            // โหลดข้อมูลรูปภาพ ในแต่ละ Tile ที่ถูกวาดลงบนแผนที่
            const imageLoader = () => {
                return new Promise((resolve) => {
                    var count = 0;
                    var imageCount = (imageKeys = Object.keys(_this.tileImagesCached)).length

                    const loader = () => {
                        var cachedItem = _this.tileImagesCached[imageKeys[count]];
                        cachedItem.canvas = _this.convertImageDataToImageObject(cachedItem.arImageData, _this.tileMapJson.tilewidth, _this.tileMapJson.tileheight, cachedItem.flipTypeProps);
                        count++;
                        if (count >= imageCount) resolve();
                        else loader();
                    };

                    loader();
                });
            };


            imageLoader().then(() => {
                _this.drawMap();

                // Sort Layers
                // _this.mapLayers.sort((a, b) => {
                //     return a.index > b.index ? -1 : 1;
                // });
                resolve(_this.ctx);
            });
        });
    };





    // // เทสีลงบน Canvas ตาม Width, Height ของ Canvas
    // // ctx = Context 2d ของ Canvas
    // // htmlColor = Html color code ไม่ผ่านค่ามาจะใช้ '_this.opts.bgColor.htmlCode'
    // this.fillBgColor = function (ctx, htmlColor) {
    //     if (null === ctx)
    //         return;

    //     ctx.save();
    //     ctx.fillStyle = htmlColor || _this.opts.bgColor.htmlCode;
    //     ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    //     ctx.restore();
    // };

    // // กำหนดสีเป็น Tranparent
    // // r,g,b = 137 (_this.opts.bgColor.r,g,b)
    // // imgData UInt8ClampArray ที่ได้จาก ctx.getImageData
    // this.fillTransparent = function (imgData) {
    //     for (var i = 0; i < imgData.length; i += 4) {
    //         var r = imgData[i],
    //             g = imgData[i + 1],
    //             b = imgData[i + 2];

    //         // ข้อมูลรูปภาพใน Pixel นั้นเป็นสีขาว ให้ลบออก
    //         if (r === _this.opts.bgColor.r && g === _this.opts.bgColor.g && b === _this.opts.bgColor.b) {
    //             imgData[i] = 255; // r
    //             imgData[i + 1] = 0; // g
    //             imgData[i + 2] = 0; // b
    //             imgData[i + 3] = 1; // alpha (0 - 255)
    //         }
    //     }
    //     return imgData;
    // }

    // this.getPoint = function (canvas, event, tilewidth) {
    //     var clientRect = canvas.getBoundingClientRect(); // หาตำแหน่งของ Grid ที่วางอยู่บนหน้าเว็บ
    //     var pointX = Math.floor((event.clientX - clientRect.left) / tilewidth); // xais index (ตำแหน่งของกล่อง แนวนอน)
    //     var pointY = Math.floor((event.clientY - clientRect.top) / tilewidth); // yais index (ตำแหน่งของกล่อง แนวตั้ง)
    //     var coord = {
    //         dx: pointX * tilewidth,
    //         dy: pointY * tilewidth
    //     };
    //     return coord;
    // }

    // points: Array ค่าที่ได้จาก this.getPoint
    // this.fillRect = function (ctx, points, tilewidth) {
    //     ctx.save();
    //     ctx.fillStyle = '#000000';
    //     ctx.globalAlpha = 0.1;
    //     ctx.fillRect(points[0].dx, points[0].dy, points.length * tilewidth, points.length * tilewidth);
    //     ctx.restore();
    // }

    // // points: Array ค่าที่ได้จาก this.getPoint
    // this.clearFillRect = function (ctx, points, tilewidth) {
    //     ctx.clearRect(points[0].dx, points[0].dy, points.length * tilewidth, points.length * tilewidth);
    // }
}).service('$customHttp', function ($http) {
    this.formPost = function (url, params, token) {
        return $http.post(url, $.param(params), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept-Language": "en,th;q=0.9",
                "x-http-secure-code": 'freewillSolution',
                "Authorization": 'Basic ' + token
            }
        });
    };

    this.bodyPost = function (url, params, token) {
        return $http.post(url, angular.toJson(params), {
            headers: {
                "Content-Type": "application/json",
                "Accept-Language": "en,th;q=0.9",
                "x-http-secure-code": 'freewillSolution',
                "Authorization": 'Basic ' + token
            }
        });
    };

    this.formPut = function (url, params, token) {
        return $http.put(url, $.param(params), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept-Language": "en,th;q=0.9",
                "x-http-secure-code": 'freewillSolution',
                "Authorization": 'Basic ' + token
            }
        });
    };

    this.formDelete = function (url, params, token) {
        return $http.delete(url + '?' + $.param(params), {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept-Language": "en,th;q=0.9",
                "x-http-secure-code": 'freewillSolution',
                "Authorization": 'Basic ' + token
            }
        });
    };


    this.formGet = function (url, params, token) {
        //$sce.trustAsResourceUrl(url);
        var queryStr = $.param(params);
        if (queryStr !== '')
            queryStr = `?${queryStr}`;

        return $http.get(url + queryStr, {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept-Language": "en,th;q=0.9",
                "x-http-secure-code": 'freewillSolution',
                "Authorization": 'Basic ' + token
            }
        });
    };
}).service('$fwModal', function(){
    //const MODAL_CONTAINER_TEMPLATE = '<div class="position-absolute w-auto h-auto"></div>';
}).directive('fwIcon', function () {
    return {
        restrict: 'E',
        replace: true,
        transclude: true,
        template: '<div class="cursor-pointer d-inline-block text-center {{icon}} f-{{fontSize}}" style="padding:1px 9px" ng-transclude></div>',
        scope: {
            icon: '@'
        },
        controller: function($timeout, $element, $attrs) {
            if($attrs.tooltip)
                $timeout(() => {
                    $element.popover({
                        container: $('body'),
                        delay: { 'show': 200 }, 
                        trigger: 'hover',
                        title: '',
                        content: $attrs.tooltip,
                        html: true
                    });
                });
        }
    };
}).directive('fwTooltipA', function(){
    return {
        restrict: 'A',
        controller: function($timeout, $element, $attrs) {
            if($attrs.fwTooltipA)
                $timeout(() => {
                    $element.popover({
                        container: $('body'),
                        delay: { 'show': 200 }, 
                        trigger: 'hover',
                        title: '',
                        content: $attrs.fwTooltipA,
                        html: true
                    });
                });
        }
    };
}).directive('fwCloud', function(){
    return {
        restrict: 'E',
        transclude: true,
        replace: true,
        scope: {
            visible: '=?',
            width: '@?',
        },
        template:
            '<div class="position-absolute bg-light p-2 border shadow-sm" ng-class="{\'cursor-move\': $settings.startMove}" style="z-index:4;top:51px;right:15px;width:{{width||200}}px;height:auto;max-height:200px;">' +
            //'   <div class="position-absolute ion-circled text-danger f-16 f-w-900 cursor-pointer" ng-click="minimize()" style="top:-8px;right:-8px;"></div>' +
            '   <div class="overflow-auto custom-scrollbar">' +
            '       <div ng-transclude></div>' +
            '   </div>' +
            '</div>',
        link: function(scope, element){
            const beginMovePoint = (e) => {
                return {dx: e ? e.clientX : null, dy: e ? e.clientY : null };
            };
            scope.$settings = {
                minimize: false,
                startMove: false,
                startMovePoint: beginMovePoint()
            };
            element[0].addEventListener('mousedown', (e) => {
                scope.$settings.startMove = true;
                scope.$settings.startMovePoint = beginMovePoint(e);
            });
            document.addEventListener('mouseup', () => {
                scope.$settings.startMove = false;
            });
            document.addEventListener('mousemove', (e) => {
                if(!scope.$settings.startMove) return;

                const offsetLeft = scope.$settings.startMovePoint.dx;
                const offsetTop = scope.$settings.startMovePoint.dy;

                const left = Math.max(element[0].offsetLeft + (e.clientX - offsetLeft), 0);
                const top = Math.max(element[0].offsetTop + (e.clientY - offsetTop), 0);
                //console.log(`left: ${left}, top: ${top}`);
                element.offset({ top: top, left: left });

                scope.$settings.startMovePoint = beginMovePoint(e);
                e.preventDefault();
            });
        }
    };
});