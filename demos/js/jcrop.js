(function() {
	var ie = navigator.userAgent.match(/MSIE\s(\d)+/);
	if (ie) {
		var version = parseInt(ie[1]);
		Prototype.Browser['IE' + version] = true;
	}
})();

Jcrop = function(obj,opt) {
	if (typeof(obj) !== 'object') obj = $(obj);
	if (typeof(opt) !== 'object') opt = {};

	// Some on-the-fly fixes for MSIE...sigh
	if (!('trackDocument' in opt))
		opt.trackDocument = !Prototype.Browser.IE || Prototype.Browser.IE8;
	if (!('keySupport' in opt))
		opt.keySupport = !Prototype.Browser.IE;
		
	var defaults = {
		// Basic Settings
		trackDocument:		false,
		baseClass:			'jcrop',
		addClass:			null,

		// Styling Options
		bgColor:			'black',
		bgOpacity:			.6,
		borderOpacity:		.4,
		handleOpacity:		.5,

		handlePad:			5,
		handleSize:			9,
		handleOffset:		5,
		edgeMargin:			14,

		aspectRatio:		0,
		keySupport:			true,
		cornerHandles:		true,
		sideHandles:		true,
		drawBorders:		true,
		dragEdges:			true,

		boxWidth:			0,
		boxHeight:			0,

		boundary:			8,
		animationDelay:		20,
		swingSpeed:			3,

		allowSelect:		true,
		allowMove:			true,
		allowResize:		true,

		minSelect:			[ 0, 0 ],
		maxSize:			[ 0, 0 ],
		minSize:			[ 0, 0 ],

		// Callbacks / Event Handlers
		onChange: Prototype.emptyFunction,
		onSelect: Prototype.emptyFunction
	}, options = defaults;
	setOptions(opt);

	var $origimg = $(obj),
		$img = $origimg.clone().writeAttribute('id', null).setStyle({ position: 'absolute' }),
		d = $origimg.getDimensions();
	$img.setStyle({width: px(d.width), height: px(d.height)});
	$origimg.insert({after: $img}).hide();

	presize($img,options.boxWidth,options.boxHeight);

	d = $img.getDimensions();
	var boundx = d.width,
		boundy = d.height,
		$div = new Element('div')
			.setStyle({width: px(boundx), height: px(boundy)})
			.addClassName(cssClass('holder'))
			.setStyle({
				position: 'relative',
				backgroundColor: options.bgColor
			});
		$origimg.insert({after: $div});
		$div.insert($img);
	
	if (options.addClass) $div.addClassName(options.addClass);

	var $img2 = new Element('img', {src: $img.src})
			.setStyle({
				position: 'absolute',
				width: px(boundx), height: px(boundy)
			}),
		$img_holder = new Element('div')
		.setStyle({
			width: pct(100), height: pct(100),
			zIndex: 310,
			position: 'absolute',
			overflow: 'hidden'
		})
		.insert($img2),
		$hdl_holder = new Element('div')
		.setStyle({
			width: pct(100), height: pct(100),
			zIndex: 320
		}),
		$sel = new Element('div')
		.setStyle({
			position: 'absolute',
			zIndex: 300
		});
	$img.insert({before: $sel});
	$sel.insert($img_holder).insert($hdl_holder);

	var bound = options.boundary,
		$trk = newTracker()
		.setStyle({
			width: px(boundx + (bound*2)), height: px(boundy + (bound*2)),
			position: 'absolute', top: px(-bound), left: px(-bound), zIndex: 290 })
		.observe('mousedown', newSelection),	
		// Set more variables
		xlimit, ylimit, xmin, ymin,
		xscale, yscale, enabled = true,
		docOffset = getPos($img),
		// Internal states
		btndown, lastcurs, dimmed, animating,
		shift_down;
		
	// Internal Modules
	var Coords = function() {
		var x1 = 0, y1 = 0, x2 = 0, y2 = 0, ox, oy;

		function setPressed(pos) {
			var pos = rebound(pos);
			x2 = x1 = pos[0];
			y2 = y1 = pos[1];
		}
		
		function setCurrent(pos) {
			var pos = rebound(pos);
			ox = pos[0] - x2;
			oy = pos[1] - y2;
			x2 = pos[0];
			y2 = pos[1];
		}
		
		function getOffset() {
			return [ ox, oy ];
		}
		
		function moveOffset(offset) {
			var ox = offset[0], oy = offset[1];

			if (0 > x1 + ox) ox -= ox + x1;
			if (0 > y1 + oy) oy -= oy + y1;

			if (boundy < y2 + oy) oy += boundy - (y2 + oy);
			if (boundx < x2 + ox) ox += boundx - (x2 + ox);

			x1 += ox;
			x2 += ox;
			y1 += oy;
			y2 += oy;
		}
		
		function getCorner(ord) {
			var c = getFixed();
			switch(ord) {
				case 'ne': return [ c.x2, c.y ];
				case 'nw': return [ c.x, c.y ];
				case 'se': return [ c.x2, c.y2 ];
				case 'sw': return [ c.x, c.y2 ];
			}
		}
		
		function getFixed() {
			if (!options.aspectRatio) return getRect();
			// This function could use some optimization I think...
			var aspect = options.aspectRatio,
				min_x = options.minSize[0]/xscale, 
				min_y = options.minSize[1]/yscale,
				max_x = options.maxSize[0]/xscale, 
				max_y = options.maxSize[1]/yscale,
				rw = x2 - x1,
				rh = y2 - y1,
				rwa = Math.abs(rw),
				rha = Math.abs(rh),
				real_ratio = rwa / rha,
				xx, yy;
			if (max_x == 0) { max_x = boundx * 10 }
			if (max_y == 0) { max_y = boundy * 10 }
			if (real_ratio < aspect) {
				yy = y2;
				w = rha * aspect;
				xx = rw < 0 ? x1 - w : w + x1;

				if (xx < 0) {
					xx = 0;
					h = Math.abs((xx - x1) / aspect);
					yy = rh < 0 ? y1 - h: h + y1;
				} else if (xx > boundx) {
					xx = boundx;
					h = Math.abs((xx - x1) / aspect);
					yy = rh < 0 ? y1 - h : h + y1;
				}
			} else {
				xx = x2;
				h = rwa / aspect;
				yy = rh < 0 ? y1 - h : y1 + h;
				if (yy < 0) {
					yy = 0;
					w = Math.abs((yy - y1) * aspect);
					xx = rw < 0 ? x1 - w : w + x1;
				} else if (yy > boundy) {
					yy = boundy;
					w = Math.abs(yy - y1) * aspect;
					xx = rw < 0 ? x1 - w : w + x1;
				}
			}
			// Magic %-)
			if(xx > x1) { // right side
			  if(xx - x1 < min_x) {
				xx = x1 + min_x;
			  } else if (xx - x1 > max_x) {
				xx = x1 + max_x;
			  }
			  if(yy > y1) {
				yy = y1 + (xx - x1)/aspect;
			  } else {
				yy = y1 - (xx - x1)/aspect;
			  }
			} else if (xx < x1) { // left side
			  if(x1 - xx < min_x) {
				xx = x1 - min_x
			  } else if (x1 - xx > max_x) {
				xx = x1 - max_x;
			  }
			  if(yy > y1) {
				yy = y1 + (x1 - xx)/aspect;
			  } else {
				yy = y1 - (x1 - xx)/aspect;
			  }
			}

			if(xx < 0) {
				x1 -= xx;
				xx = 0;
			} else  if (xx > boundx) {
				x1 -= xx - boundx;
				xx = boundx;
			}

			if(yy < 0) {
				y1 -= yy;
				yy = 0;
			} else  if (yy > boundy) {
				y1 -= yy - boundy;
				yy = boundy;
			}

			return last = makeObj(flipCoords(x1,y1,xx,yy));
		}
		
		function rebound(p) {
			if (p[0] < 0) p[0] = 0;
			if (p[1] < 0) p[1] = 0;

			if (p[0] > boundx) p[0] = boundx;
			if (p[1] > boundy) p[1] = boundy;

			return [ p[0], p[1] ];
		}
		
		function flipCoords(x1,y1,x2,y2) {
			var xa = x1, xb = x2, ya = y1, yb = y2;
			if (x2 < x1) {
				xa = x2;
				xb = x1;
			}
			if (y2 < y1) {
				ya = y2;
				yb = y1;
			}
			return [ Math.round(xa), Math.round(ya), Math.round(xb), Math.round(yb) ];
		}
		
		function getRect() {
			var xsize = x2 - x1;
			var ysize = y2 - y1;

			if (xlimit && (Math.abs(xsize) > xlimit))
				x2 = (xsize > 0) ? (x1 + xlimit) : (x1 - xlimit);
			if (ylimit && (Math.abs(ysize) > ylimit))
				y2 = (ysize > 0) ? (y1 + ylimit) : (y1 - ylimit);

			if (ymin && (Math.abs(ysize) < ymin))
				y2 = (ysize > 0) ? (y1 + ymin) : (y1 - ymin);
			if (xmin && (Math.abs(xsize) < xmin))
				x2 = (xsize > 0) ? (x1 + xmin) : (x1 - xmin);

			if (x1 < 0) { x2 -= x1; x1 -= x1; }
			if (y1 < 0) { y2 -= y1; y1 -= y1; }
			if (x2 < 0) { x1 -= x2; x2 -= x2; }
			if (y2 < 0) { y1 -= y2; y2 -= y2; }
			if (x2 > boundx) { var delta = x2 - boundx; x1 -= delta; x2 -= delta; }
			if (y2 > boundy) { var delta = y2 - boundy; y1 -= delta; y2 -= delta; }
			if (x1 > boundx) { var delta = x1 - boundy; y2 -= delta; y1 -= delta; }
			if (y1 > boundy) { var delta = y1 - boundy; y2 -= delta; y1 -= delta; }

			return makeObj(flipCoords(x1,y1,x2,y2));
		}
		
		function makeObj(a) {
			return { x: a[0], y: a[1], x2: a[2], y2: a[3],
				w: a[2] - a[0], h: a[3] - a[1] };
		}

		return {
			flipCoords: flipCoords,
			setPressed: setPressed,
			setCurrent: setCurrent,
			getOffset: getOffset,
			moveOffset: moveOffset,
			getCorner: getCorner,
			getFixed: getFixed
		};
	}();
	
	var Selection = function() {
		var start, end, dragmode, awake, hdep = 370,
			borders = {},
			handle = {},
			seehandles = false,
			hhs = options.handleOffset;

		/* Insert draggable elements */

		// Insert border divs for outline
		if (options.drawBorders) {
			borders = {
					top: insertBorder('hline')
						.setStyle({top: Prototype.Browser.IE ? px(-1) : px(0)}),
					bottom: insertBorder('hline'),
					left: insertBorder('vline'),
					right: insertBorder('vline')
			};
		}
		// Insert handles on edges
		if (options.dragEdges) {
			handle.t = insertDragbar('n');
			handle.b = insertDragbar('s');
			handle.r = insertDragbar('e');
			handle.l = insertDragbar('w');
		}
		// Insert side handles
		options.sideHandles &&
			createHandles(['n','s','e','w']);
		// Insert corner handles
		options.cornerHandles &&
			createHandles(['sw','nw','ne','se']);
		
		// Private Methods
		function insertBorder(type) {
			var jq = new Element('div')
				.setStyle({position: 'absolute', opacity: options.borderOpacity })
				.addClassName(cssClass(type));
			$img_holder.insert(jq);
			return jq;
		}
		
		function dragDiv(ord,zi) {
			var jq = new Element('div')
				.observe('mousedown', createDragger(ord))
				.setStyle({
					cursor: ord+'-resize',
					position: 'absolute',
					zIndex: zi 
				});
			$hdl_holder.insert(jq);
			return jq;
		}
		
		function insertHandle(ord) {
			return dragDiv(ord,hdep++)
				.setStyle({ top: px(-hhs+1), left: px(-hhs+1), opacity: options.handleOpacity })
				.addClassName(cssClass('handle'));
		}
		
		function insertDragbar(ord) {
			var s = options.handleSize,
				o = hhs,
				h = s, w = s,
				t = o, l = o;

			switch(ord) {
				case 'n': case 's': w = pct(100); break;
				case 'e': case 'w': h = pct(100); break;
			}

			return dragDiv(ord,hdep++)
				.setStyle({
					width: px(w), height: px(h),
					top: px(-t+1), left: px(-l+1)});
		}
		
		function createHandles(li) {
			li.each(function(i) {handle[i] = insertHandle(i);});
		}
		
		function moveHandles(c) {
			var midvert  = Math.round((c.h / 2) - hhs),
				midhoriz = Math.round((c.w / 2) - hhs),
				north = west = -hhs+1,
				east = c.w - hhs,
				south = c.h - hhs,
				x, y;

			if ('e' in handle) {
				handle.e.setStyle({ top: px(midvert), left: px(east) });
				handle.w.setStyle({ top: px(midvert) });
				handle.s.setStyle({ top: px(south), left: px(midhoriz) });
				handle.n.setStyle({ left: px(midhoriz) });
			}
			if ('ne' in handle) {
				handle.ne.setStyle({ left: px(east) });
				handle.se.setStyle({ top: px(south), left: px(east) });
				handle.sw.setStyle({ top: px(south) });
			}
			if ('b' in handle) {
				handle.b.setStyle({ top: px(south) });
				handle.r.setStyle({ left: px(east) });
			}
		}
		
		function moveto(x,y) {
			$img2.setStyle({ top: px(-y), left: px(-x) });
			$sel.setStyle({ top: px(y), left: px(x) });
		}
		
		function resize(w,h) {
			$sel.setStyle({width: px(w), height: px(h)});
		}
		
		function refresh() {
			var c = Coords.getFixed();

			Coords.setPressed([c.x,c.y]);
			Coords.setCurrent([c.x2,c.y2]);

			updateVisible();
		}

		// Internal Methods
		function updateVisible() { if (awake) return update(); };
		
		function update() {
			var c = Coords.getFixed();

			resize(c.w,c.h);
			moveto(c.x,c.y);

			if (options.drawBorders) {
				borders['right'].setStyle({ left: px(c.w-1) });
				borders['bottom'].setStyle({ top: px(c.h-1) });
			}
			if (seehandles) moveHandles(c);
			if (!awake) show();

			options.onChange(unscale(c));
		}
		
		function show() {
			$sel.show();
			$img.setOpacity(options.bgOpacity);
			awake = true;
		}
		
		function release() {
			disableHandles();
			$sel.hide();
			$img.setOpacity(1);
			awake = false;
		}
		
		function showHandles() {
			if (seehandles) {
				moveHandles(Coords.getFixed());
				$hdl_holder.show();
			}
		}
		
		function enableHandles() { 
			seehandles = true;
			if (options.allowResize) {
				moveHandles(Coords.getFixed());
				$hdl_holder.show();
			}
		}
		
		function disableHandles() {
			seehandles = false;
			$hdl_holder.hide();
		}
		
		function animMode(v) {
			(animating = v) ? disableHandles(): enableHandles();
		}
		
		function done() {
			animMode(false);
			refresh();
		}

		var $track = newTracker()
				.observe('mousedown', createDragger('move'))
				.setStyle({ cursor: 'move', position: 'absolute', zIndex: 360 });

		$img_holder.insert($track);
		disableHandles();

		return {
			updateVisible: updateVisible,
			update: update,
			release: release,
			refresh: refresh,
			setCursor: function (cursor) { $track.setStyle({cursor: cursor}); },
			enableHandles: enableHandles,
			enableOnly: function() { seehandles = true; },
			showHandles: showHandles,
			disableHandles: disableHandles,
			animMode: animMode,
			done: done
		};
	}();
	
	var Tracker = function() {
		var onMove = Prototype.emptyFunction,
			onDone = Prototype.emptyFunction,
			trackDoc = options.trackDocument;

		if (!trackDoc) {
			$trk.observe('mousemove', trackMove)
				.observe('mouseup', trackUp)
				.observe('mouseout', trackUp);
		}

		function toFront() {
			$trk.setStyle({zIndex:450});
			if (trackDoc) {
				document.observe('mousemove', trackMove)
						.observe('mouseup', trackUp);
			}
		}
		
		function toBack() {
			$trk.setStyle({zIndex:290});
			if (trackDoc) {
				document.stopObserving('mousemove',trackMove)
						.stopObserving('mouseup',trackUp);
			}
		}
		
		function trackMove(e) {
			onMove(mouseAbs(e));
		}
		
		function trackUp(e) {
			e.stop();

			if (btndown) {
				btndown = false;

				onDone(mouseAbs(e));
				options.onSelect(unscale(Coords.getFixed()));
				toBack();
				onMove = Prototype.emptyFunction;
				onDone = Prototype.emptyFunction;
			}
		}

		function activateHandlers(move, done) {
			btndown = true;
			onMove = move;
			onDone = done;
			toFront();
		}

		function setCursor(t) { $trk.setStyle({cursor: t}); };

		$img.insert({before: $trk});
		return {
			activateHandlers: activateHandlers,
			setCursor: setCursor
		};
	}();
	
	var KeyManager = function() {
		var $keymgr = new Element('input', {type: 'radio'})
				.setStyle({ position: 'absolute', left: '-30px' })
				.observe('keypress', parseKey)
				.observe('blur', onBlur),
			$keywrap = new Element('div')
				.setStyle({	position: 'absolute', overflow: 'hidden' })
				.insert($keymgr);

		function watchKeys() {
			if (options.keySupport) {
				$keymgr.show();
				$keymgr.focus();
			}
		}
		
		function onBlur(e) {
			$keymgr.hide();
		}
		
		function doNudge(e,x,y) {
			if (options.allowMove) {
				Coords.moveOffset([x,y]);
				Selection.updateVisible();
			}
			e.stop();
		}
		
		function parseKey(e) {
			if (e.ctrlKey) return;
			shift_down = e.shiftKey ? true : false;
			var nudge = shift_down ? 10 : 1;
			switch(e.keyCode) {
				case Event.KEY_LEFT: doNudge(e,-nudge,0); break;
				case Event.KEY_RIGHT: doNudge(e,nudge,0); break;
				case Event.KEY_UP: doNudge(e,0,-nudge); break;
				case Event.KEY_DOWN: doNudge(e,0,nudge); break;

				case Event.KEY_ESC: Selection.release(); break;

				case Event.KEY_TAB: return;
			}
			e.stop();
		}
		
		
		if (options.keySupport) $img.insert({before: $keywrap});
		return {
			watchKeys: watchKeys
		}
	}();
	
	// Internal Methods
	function px(n) {
		if (Object.isString(n) && (n.endsWith('%') || n.endsWith('em'))) return n;
		return parseInt(n) + 'px';
	}
	function pct(n) { return parseInt(n) + '%'; }
	function cssClass(cl) { return options.baseClass + '-' + cl; };
	function getPos(obj) {
		var pos = $(obj).cumulativeOffset();
		return [ pos.left, pos.top ];
	}
	
	function mouseAbs(e) {
		return [ (e.pointerX() - docOffset[0]), (e.pointerY() - docOffset[1]) ];
	}
	
	function myCursor(type) {
		if (type != lastcurs) {
			Tracker.setCursor(type);
			lastcurs = type;
		}
	}
	
	function startDragMode(mode,pos) {
		docOffset = getPos($img);
		Tracker.setCursor(mode=='move'?mode:mode+'-resize');

		if (mode == 'move')
			return Tracker.activateHandlers(createMover(pos), doneSelect);

		var fc = Coords.getFixed();
		var opp = oppLockCorner(mode);
		var opc = Coords.getCorner(oppLockCorner(opp));

		Coords.setPressed(Coords.getCorner(opp));
		Coords.setCurrent(opc);

		Tracker.activateHandlers(dragmodeHandler(mode,fc),doneSelect);
	}
	
	function dragmodeHandler(mode,f) {
		return function(pos) {
			if (!options.aspectRatio) switch(mode) {
				case 'e': pos[1] = f.y2; break;
				case 'w': pos[1] = f.y2; break;
				case 'n': pos[0] = f.x2; break;
				case 's': pos[0] = f.x2; break;
			} else switch(mode) {
				case 'e': pos[1] = f.y+1; break;
				case 'w': pos[1] = f.y+1; break;
				case 'n': pos[0] = f.x+1; break;
				case 's': pos[0] = f.x+1; break;
			}
			Coords.setCurrent(pos);
			Selection.update();
		};
	}
	
	function createMover(pos) {
		var lloc = pos;
		KeyManager.watchKeys();

		return function(pos) {
			Coords.moveOffset([pos[0] - lloc[0], pos[1] - lloc[1]]);
			lloc = pos;
			
			Selection.update();
		};
	}
	
	function oppLockCorner(ord) {
		switch(ord) {
			case 'n': return 'sw';
			case 's': return 'nw';
			case 'e': return 'nw';
			case 'w': return 'ne';
			case 'ne': return 'sw';
			case 'nw': return 'se';
			case 'se': return 'nw';
			case 'sw': return 'ne';
		};
	}
	
	function createDragger(ord) {
		return function(e) {
			if (options.disabled) return;
			if (ord == 'move' && !options.allowMove) return;
			btndown = true;
			startDragMode(ord,mouseAbs(e));
			e.stop();
		};
	}
	
	function presize($obj,w,h) {
		var d = $obj.getDimensions(),
			nw = d.width, nh = d.height;
		if (nw > w && w > 0) {
			nw = w;
			nh = (w/d.width) * d.height;
		}
		if (nh > h && h > 0) {
			nh = h;
			nw = (h/d.height) * d.width;
		}
		xscale = d.width / nw;
		yscale = d.height / nh;
		$obj.setStyle({width: px(nw), height: px(nh)});
	}
	
	function unscale(c) {
		return {
			x: parseInt(c.x * xscale), y: parseInt(c.y * yscale), 
			x2: parseInt(c.x2 * xscale), y2: parseInt(c.y2 * yscale), 
			w: parseInt(c.w * xscale), h: parseInt(c.h * yscale)
		};
	}
	
	function doneSelect(pos) {
		var c = Coords.getFixed();
		if (c.w > options.minSelect[0] && c.h > options.minSelect[1]) {
			Selection.enableHandles();
			Selection.done();
		} else {
			Selection.release();
		}
		Tracker.setCursor( options.allowSelect?'crosshair':'default' );
	}
	
	function newSelection(e) {
		if (options.disabled || !options.allowSelect) return false;
		btndown = true;
		docOffset = getPos($img);
		Selection.disableHandles();
		myCursor('crosshair');
		var pos = mouseAbs(e);
		Coords.setPressed(pos);
		Tracker.activateHandlers(selectDrag,doneSelect);
		KeyManager.watchKeys();
		Selection.update();

		e.stop();
	}
	
	function selectDrag(pos) {
		Coords.setCurrent(pos);
		Selection.update();
	}
	
	function newTracker() {
		var trk = new Element('div').addClassName(cssClass('tracker'));
		Prototype.Browser.IE && trk.setStyle({ opacity: 0, backgroundColor: '#fff' });
		return trk;
	}
	
	// API methods
	function animateTo(a) {
		var x1 = a[0] / xscale,
			y1 = a[1] / yscale,
			x2 = a[2] / xscale,
			y2 = a[3] / yscale;

		if (animating) return;

		var animto = Coords.flipCoords(x1,y1,x2,y2),
			c = Coords.getFixed(),
			animat = initcr = [ c.x, c.y, c.x2, c.y2 ],
			interv = options.animationDelay,

			x = animat[0],
			y = animat[1],
			x2 = animat[2],
			y2 = animat[3],
			ix1 = animto[0] - initcr[0],
			iy1 = animto[1] - initcr[1],
			ix2 = animto[2] - initcr[2],
			iy2 = animto[3] - initcr[3],
			pcent = 0,
			velocity = options.swingSpeed;

		Selection.animMode(true);

		var animator = function() {
			pcent += (100 - pcent) / velocity;

			animat[0] = x + ((pcent / 100) * ix1);
			animat[1] = y + ((pcent / 100) * iy1);
			animat[2] = x2 + ((pcent / 100) * ix2);
			animat[3] = y2 + ((pcent / 100) * iy2);

			if (pcent < 100) animateStart();
				else Selection.done();

			if (pcent >= 99.8) pcent = 100;

			setSelectRaw(animat);
		};

		function animateStart() { window.setTimeout(animator,interv); };

		animateStart();
	}
	
	function setSelect(rect) {
		setSelectRaw([rect[0]/xscale,rect[1]/yscale,rect[2]/xscale,rect[3]/yscale]);
	}
	
	function setSelectRaw(l) {
		Coords.setPressed([l[0],l[1]]);
		Coords.setCurrent([l[2],l[3]]);
		Selection.update();
	}
	
	function setOptions(opt) {
		if (typeof(opt) != 'object') opt = { };
		Object.extend(options,opt);

		if (typeof(options.onChange)!=='function')
			options.onChange = Prototype.emptyFunction;

		if (typeof(options.onSelect)!=='function')
			options.onSelect = Prototype.emptyFunction;
	}
	
	function tellSelect() {
		return unscale(Coords.getFixed());
	}
	
	function tellScaled() {
		return Coords.getFixed();
	}
	
	function setOptionsNew(opt) {
		setOptions(opt);
		interfaceUpdate();
	}
	
	function disableCrop() {
		options.disabled = true;
		Selection.disableHandles();
		Selection.setCursor('default');
		Tracker.setCursor('default');
	}
	
	function enableCrop() {
		options.disabled = false;
		interfaceUpdate();
	}
	
	function cancelCrop() {
		Selection.done();
		Tracker.activateHandlers(null,null);
	}
	
	function destroy() {
		$div.remove();
		$origimg.show();
	}

	function interfaceUpdate(alt) {
	// This method tweaks the interface based on options object.
	// Called when options are changed and at end of initialization.
		options.allowResize ?
			alt?Selection.enableOnly():Selection.enableHandles():
			Selection.disableHandles();

		Tracker.setCursor( options.allowSelect? 'crosshair': 'default' );
		Selection.setCursor( options.allowMove? 'move': 'default' );

		$div.setStyle({backgroundColor: options.bgColor});

		if ('setSelect' in options) {
			setSelect(opt.setSelect);
			Selection.done();
			delete(options.setSelect);
		}

		if ('trueSize' in options) {
			xscale = options.trueSize[0] / boundx;
			yscale = options.trueSize[1] / boundy;
		}

		xlimit = options.maxSize[0] || 0;
		ylimit = options.maxSize[1] || 0;
		xmin = options.minSize[0] || 0;
		ymin = options.minSize[1] || 0;

		if ('outerImage' in options) {
			$img.src = options.outerImage;
			delete(options.outerImage);
		}

		Selection.refresh();
	}

	$hdl_holder.hide();
	interfaceUpdate(true);
	
	var api = {
		animateTo: animateTo,
		setSelect: setSelect,
		setOptions: setOptionsNew,
		tellSelect: tellSelect,
		tellScaled: tellScaled,

		disable: disableCrop,
		enable: enableCrop,
		cancel: cancelCrop,

		focus: KeyManager.watchKeys,

		getBounds: function() { return [ boundx * xscale, boundy * yscale ]; },
		getWidgetSize: function() { return [ boundx, boundy ]; },

		release: Selection.release,
		destroy: destroy
	};

	$origimg.getStorage().set('Jcrop',api);
	return api;
};

Element.addMethods('img', {
	jcrop: function(element) {
		element = $(element);
		var options = arguments[1] || {},
			api = element.getStorage().get('Jcrop');
		if (api) {
			if (options == 'api') return api;
			else api.setOptions(options);
		} else {
			var src = options.useImg || element.src,
				img = new Image();
			img.onload = function() { Jcrop(element, options); };
			img.src = src;
		}
		return element;
	}
});
