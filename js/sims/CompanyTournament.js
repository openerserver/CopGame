CompanyTournament.resetGlobalVariables = function(max_num){

	CompanyTournament.SELECTION = 5;
	CompanyTournament.NUM_TURNS = 10;
	var ss=parseInt(max_num/8);
	CompanyTournament.INITIAL_AGENTS = [
		{strategy:"c_tft", count:ss},
		{strategy:"c_all_d", count:ss},
		{strategy:"c_all_c", count:ss},
		{strategy:"c_grudge", count:ss},
		{strategy:"c_prober", count:ss},
		{strategy:"c_tf2t", count:ss},
		{strategy:"c_pavlov", count:ss},
		{strategy:"c_random", count:max_num-ss*7}
		//{strategy:"random2", count:4}
	];

	CompanyTournament.FLOWER_CONNECTIONS = false;


	publish("pd/defaultPayoffs");

	PD.NOISE = 0;

};

// CompanyTournament.resetGlobalVariables();

subscribe("companyrules/evolution",function(value){
	CompanyTournament.SELECTION = value;
});

subscribe("companyrules/turns",function(value){
	CompanyTournament.NUM_TURNS = value;
});

subscribe("companyrules/task_num",function(value){
	CompanyTournament.TASK_NUM = value;
});

subscribe("companyrules/corp_num",function(value){
	CompanyTournament.CORP_NUM = value;
});

subscribe("companyrules/max_num",function(value){
	var ss=parseInt(value/8);
	CompanyTournament.INITIAL_AGENTS = [
		{strategy:"c_tft", count:ss},
		{strategy:"c_all_d", count:ss},
		{strategy:"c_all_c", count:ss},
		{strategy:"c_grudge", count:ss},
		{strategy:"c_prober", count:ss},
		{strategy:"c_tf2t", count:ss},
		{strategy:"c_pavlov", count:ss},
		{strategy:"c_random", count:value-ss*7}
		//{strategy:"random2", count:4}
	];
	publish("sandbox/pop/c_tft", [ss]);
	publish("sandbox/pop/c_all_d", [ss]);
	publish("sandbox/pop/c_all_c", [ss]);
	publish("sandbox/pop/c_grudge", [ss]);
	publish("sandbox/pop/c_prober", [ss]);
	publish("sandbox/pop/c_tf2t", [ss]);
	publish("sandbox/pop/c_pavlov", [ss]);
	publish("sandbox/pop/c_random", [value-ss*7]);
	publish("companytournament/reset");

});
// OH THAT'S SO COOL. Mostly C: Pavlov wins, Mostly D: tit for two tats wins (with 5% mistake!)
// ALSO, NOISE: tft vs all_d. no random: tft wins. low random: tf2t wins. high random: all_d wins. totally random: nobody wins

//////////////////////////////////////////////
//////////////////////////////////////////////

// REGULAR LOAD
Loader.addToManifest(Loader.manifest,{
	companytournament_peep: "assets/companytournament/tournament_peep.json",
	connection_flower: "assets/companytournament/connection_flower.json",

	// SFX
	squeak: "assets/companysounds/squeak.mp3",
	bonk: "assets/companysounds/bonk.mp3"

});

function CompanyTournament(config){

	var self = this;
	self.id = config.id;

	// APP
	var app = new PIXI.Application(500, 500, {transparent:true, resolution:2});
	self.dom = app.view;

	// DOM
	self.dom.className = "object";
	self.dom.style.width = 600;
	self.dom.style.height = 600;
	self.dom.style.left = (config.x-150)+"px";
	self.dom.style.top = (config.y-0)+"px";
	//self.dom.style.border = "1px solid rgba(0,0,0,0.2)";

	var _convertCountToArray = function(countList){
		var array = [];
		for(var i=0; i<AGENTS.length; i++){
			var A = AGENTS[i];
			var strategy = A.strategy;
			var count = A.count;
			for(var j=0; j<count; j++){
				array.push(strategy);
			}
		}
		return array;
	};

	self.agents = [];
	self.connections = [];

	self.networkContainer = new PIXI.Container();
	self.agentsContainer = new PIXI.Container();
	app.stage.addChild(self.networkContainer);
	app.stage.addChild(self.agentsContainer);

	self.populateAgents = function(){

		// Clear EVERYTHING
		while(self.agents.length>0) self.agents[0].kill();
		
		// Convert to an array
		self.agents = _convertCountToArray(AGENTS);

		// Put 'em in a ring
		var count = 0;
		for(var i=0; i<self.agents.length; i++){

			// Angle

			var angle = (i/self.agents.length)*Math.TAU - Math.TAU/4;

			// What kind of agent?
			var strategy = self.agents[i];
			var agent = new CompanyTournamentAgent({angle:angle, strategy:strategy, companytournament:self});
			self.agentsContainer.addChild(agent.graphics);

			// Remember me!
			self.agents[i] = agent;

		}

		// (sort agents by depth)
		self.sortAgentsByDepth();

	};
	self.sortAgentsByDepth = function(){
		self.agentsContainer.children.sort(function(a,b){
			return a.y - b.y;
		});
	};

	self.createNetwork = function(){

		// Clear EVERYTHING
		while(self.connections.length>0) self.connections[0].kill();
		
		// Connect all of 'em
		for(var i=0; i<self.agents.length; i++){
			var playerA = self.agents[i];
			var flip = false;
			for(var j=i+1; j<self.agents.length; j++){
				var playerB = self.agents[j];
				var connection = new CompanyTournamentConnection({
					companytournament: self,
					from: playerA,
					to: playerB,
					flower_flip: flip
				});
				self.networkContainer.addChild(connection.graphics);
				self.connections.push(connection);
				flip = !flip;
			}
		}

	};
	self.actuallyRemoveConnection = function(connection){
		var index = self.connections.indexOf(connection);
		self.connections.splice(index,1);
	};


	///////////////////////
	// RESET //////////////
	///////////////////////

	var AGENTS;
	self.reset = function(){
        
		// Agents & Network...
		AGENTS = JSON.parse(JSON.stringify(CompanyTournament.INITIAL_AGENTS));

		self.populateAgents();
		self.createNetwork();

		// Animation...
		self.STAGE = STAGE_REST;
		_playIndex = 0;
		_tweenTimer = 0;

		// Stop autoplay!
		publish("companytournament/autoplay/stop");
		_step = 0;
        publish("companytournament/clearscore");
        _times=0;

	};

	listen(self, "companytournament/reset", self.reset);

	self.reset();
    

	////////////////////////////////////
	// EVOLUTION ///////////////////////
	////////////////////////////////////

	// Play one companytournament
	self.agentsSorted = null;
	self.playOneTournament = function(){
		PD.playOneTournament_1(self.agents,CompanyTournament.CORP_NUM, CompanyTournament.NUM_TURNS,CompanyTournament.TASK_NUM);
		self.agentsSorted = _shuffleArray(self.agents.slice());
		self.agentsSorted.sort(function(a,b){ return a.coins-b.coins; });
	};

    self.getworstagentname=function(){
        var worstagentname="";
        var worstagent=self.agentsSorted.slice(0,CompanyTournament.SELECTION);
        for(var i=0;i<worstagent.length;i++){
            // worstagentname.push(worstagent[i].strategyName);
            worstagentname = worstagentname + " "+ Words.get("label_short_"+worstagent[i].strategyName)  ;
        }
        return worstagentname;
    };
	// Get rid of X worst
	self.eliminateBottom = function(X){

		// The worst X
		var worst = self.agentsSorted.slice(0,X);

		// For each one, subtract from AGENTS count, and KILL.
		for(var i=0; i<worst.length; i++){
			var badAgent = worst[i];
			var config = AGENTS.find(function(config){
				return config.strategy==badAgent.strategyName;
			});
			config.count--; // remove one
			badAgent.eliminate(); // ELIMINATE
		}

	};
	self.actuallyRemoveAgent = function(agent){
		var index = self.agents.indexOf(agent);
		self.agents.splice(index,1);
	};

	// Reproduce the top X
	self.reproduceTop = function(X){

		// The top X
		var best = self.agentsSorted.slice(self.agentsSorted.length-X, self.agentsSorted.length);

		// For each one, add to AGENTS count
		for(var i=0; i<best.length; i++){
			var goodAgent = best[i];
			var config = AGENTS.find(function(config){
				return config.strategy==goodAgent.strategyName;
			});
			config.count++; // ADD one
		}

		// ADD agents, splicing right AFTER
		for(var i=0; i<best.length; i++){

			// Properties...
			var goodAgent = best[i];
			var angle = goodAgent.angle + 0.1;
			var strategy = goodAgent.strategyName;

			// Create agent!
			var agent = new CompanyTournamentAgent({angle:angle, strategy:strategy, companytournament:self});
			self.agentsContainer.addChild(agent.graphics);

			// Splice RIGHT AFTER
			var index = self.agents.indexOf(goodAgent);
			self.agents.splice(index, 0, agent);

		}

		// What are the agents' GO-TO angles?
		for(var i=0; i<self.agents.length; i++){
			var agent = self.agents[i];
			var angle = (i/self.agents.length)*Math.TAU - Math.TAU/4;
			agent.gotoAngle = angle;
		}

		// ADD connections
		self.createNetwork();

	};

	// ANIMATE the PLAYING, ELIMINATING, or REPRODUCING
	var STAGE_REST = 0;
	var STAGE_PLAY = 1;
	var STAGE_ELIMINATE = 2;
	var STAGE_REPRODUCE = 3;
	self.STAGE = STAGE_REST;

	// AUTOPLAY
	self.isAutoPlaying = false;
	var _step = 0;
	var _nextStep = function(){
		if(self.STAGE!=STAGE_REST) return;
		if(_step==0) publish("companytournament/play");
		if(_step==1) publish("companytournament/eliminate");
		if(_step==2) publish("companytournament/reproduce");
		_step = (_step+1)%3;
	};
	var _startAutoPlay = function(){
		self.isAutoPlaying = true;
		_nextStep();
		setTimeout(function(){
			if(self.isAutoPlaying) _startAutoPlay();
		},150);
	};
	var _stopAutoPlay = function(){
		self.isAutoPlaying = false;
	};
	listen(self, "companytournament/autoplay/start", _startAutoPlay);
	listen(self, "companytournament/autoplay/stop", _stopAutoPlay);
	listen(self, "companytournament/step", function(){
		publish("companytournament/autoplay/stop");
		_nextStep();
	});

	// ANIMATE
	var _playIndex = 0;
	var _tweenTimer = 0;
    var _times=0;
	var _tick = function(delta){

		// Tick
		Tween.tick();

		// PLAY!
		if(self.STAGE == STAGE_PLAY){
				if(_playIndex>0 && _playIndex<self.agents.length+1) self.agents[_playIndex-1].dehighlightConnections();
				if(_playIndex>1 && _playIndex<self.agents.length+2) self.agents[_playIndex-2].dehighlightConnections();
				if(_playIndex<self.agents.length){
					self.agents[_playIndex].highlightConnections();
					_playIndex += self.isAutoPlaying ? 2 : 1;
				}else{
					// console.log(self)
					self.playOneTournament(); // FOR REAL, NOW.
                    var totalscores =PD.GETTOTALSCORES(self.agents);
                    var names=self.getworstagentname();
                    publish("companytournament/score",[totalscores,_times,names]);
                    _times++;
					_playIndex = 0;
					_tweenTimer = 0;
					self.STAGE = STAGE_REST;
					publish("companytournament/step/completed", ["play"]);
				}
			//}
		}

		// ELIMINATE! 
        // 
		if(self.STAGE == STAGE_ELIMINATE){
			self.eliminateBottom(CompanyTournament.SELECTION);
			_tweenTimer++;
			if(_tweenTimer==_s(0.3) || self.isAutoPlaying){
				_tweenTimer = 0;
				self.STAGE = STAGE_REST;
				publish("companytournament/step/completed", ["eliminate"]);
			}
		}

		// REPRODUCE!
		if(self.STAGE == STAGE_REPRODUCE){

			// Start
			if(_tweenTimer==0){
				self.reproduceTop(CompanyTournament.SELECTION);
			}

			// Middle...
			_tweenTimer += self.isAutoPlaying ? 0.15 : 0.05;
			if(_tweenTimer>1) _tweenTimer=1;
			for(var i=0;i<self.agents.length;i++){
				var a = self.agents[i];
				a.tweenAngle(_tweenTimer);
				a.updatePosition();
			}
			self.sortAgentsByDepth();
			for(var i=0;i<self.connections.length;i++) self.connections[i].updateGraphics();

			// End
			if(_tweenTimer>=1){
				_tweenTimer = 0;
				self.STAGE = STAGE_REST;
				publish("companytournament/step/completed", ["reproduce"]);
			}

		}

	};
	app.ticker.add(_tick);

    self._drawcircle = function(x,y,r,color){
        var g = new PIXI.Graphics();
        g.beginFill(color);
        g.drawCircle(x,y,r);
        g.endFill();
        return g;
    }
    self._drawtext = function(x,y,text,color){
        console.log(text);
        var g = new PIXI.Graphics();
        // g.beginFill(color);
        // g.drawCircle(x,y,40);
        // g.endFill();
        var t = new PIXI.Text(text,{fontSize:16,fill:0xffffff});
        t.x = x;
        t.y = y;
        g.addChild(t);
        return g;
    }

	// PLAY A TOURNAMENT
	self._startPlay = function(){
		if(!self.isAutoPlaying){
			Loader.sounds.coin_get.volume(0.1).play();
		}
		self.STAGE=STAGE_PLAY;
	};
	listen(self, "companytournament/play", self._startPlay);
	self._startEliminate = function(){
		if(!self.isAutoPlaying){
			Loader.sounds.squeak.volume(0.4).play();
		}
		self.STAGE=STAGE_ELIMINATE;
	};
	listen(self, "companytournament/eliminate", self._startEliminate);
	self._startReproduce = function(){
		if(!self.isAutoPlaying){
			Loader.sounds.bonk.volume(0.3).play();
		}
		self.STAGE=STAGE_REPRODUCE;
	};
	listen(self, "companytournament/reproduce", self._startReproduce);

	// Add...
	self.add = function(){
		_add(self);
	};

	// Remove...
	self.remove = function(){
		_stopAutoPlay();
		for(var i=0; i<self.agents.length; i++) unlisten(self.agents[i]);
		unlisten(self);
		app.destroy();
		_remove(self);
	};


}

///////////////////////////////////////////////////////
///////////////////////////////////////////////////////
///////////////////////////////////////////////////////

function CompanyTournamentConnection(config){

	var self = this;
	self.config = config;
	self.companytournament = config.companytournament;

	// Connect from & to
	self.from = config.from;
	self.to = config.to;
	self.from.connections.push(self);
	self.to.connections.push(self);

	// Graphics!
	var g;
	if(CompanyTournament.FLOWER_CONNECTIONS){
		g = _makeMovieClip("connection_flower");
		g.anchor.x = 0;
		g.anchor.y = 0;
		g.scale.set(0.5);
	}else{
		g = _makeMovieClip("connection");
		g.anchor.x = 0;
		g.anchor.y = 0.5;
		g.height = 1;
	}
	self.graphics = g;
	var _flowerLong = false;
	var _updateFlower = function(highlight){
		var frame = 0;
		if(highlight) frame+=2;
		if(_flowerLong) frame+=1;
		g.gotoAndStop(frame);
	};
	if(config.flower_flip){
		g.scale.y *= -1;
	}

	// Highlight or no?
	self.highlight = function(){
		if(CompanyTournament.FLOWER_CONNECTIONS){
			_updateFlower(true);
		}else{
			g.height = 3;
			g.gotoAndStop(1);
		}
	};
	self.dehighlight = function(){
		if(CompanyTournament.FLOWER_CONNECTIONS){
			_updateFlower(false);
		}else{
			g.height = 1;
			g.gotoAndStop(0);
		}
	};
	self.dehighlight();

	// Stretch dat bad boy
	self.updateGraphics = function(){
		
		var f = self.from.graphics;
		var t = self.to.graphics;
		var dx = t.x-f.x;
		var dy = t.y-f.y;
		var a = Math.atan2(dy,dx);
		var dist = Math.sqrt(dx*dx+dy*dy);

		g.x = f.x; 
		g.y = f.y;

		if(CompanyTournament.FLOWER_CONNECTIONS){
			if(dist<250){
				_flowerLong = false;
				if(config.flower_flip){
					g.rotation = a+Math.TAU/10;
				}else{
					g.rotation = a-Math.TAU/10;
				}
			}else{
				_flowerLong = true;
				if(config.flower_flip){
					g.rotation = a+Math.TAU/5;
				}else{
					g.rotation = a-Math.TAU/5;
				}
			}
			_updateFlower();
		}else{
			g.rotation = a;
			g.width = dist;
		}

	};
	self.updateGraphics();

	// KILL
	self.IS_DEAD = false;
	self.kill = function(){
		if(self.IS_DEAD) return;
		self.IS_DEAD = true;
		self.graphics.parent.removeChild(self.graphics); // remove self's graphics
		self.companytournament.actuallyRemoveConnection(self);
	};

};

///////////////////////////////////////////////////////
///////////////////////////////////////////////////////
///////////////////////////////////////////////////////

function CompanyTournamentAgent(config){

	var self = this;
	self.strategyName = config.strategy;
	self.companytournament = config.companytournament;
	self.angle = config.angle;
	self.gotoAngle = self.angle;


	// Connections
	self.connections = [];
	self.highlightConnections = function(){
		for(var i=0;i<self.connections.length;i++) self.connections[i].highlight();
	};
	self.dehighlightConnections = function(){
		for(var i=0;i<self.connections.length;i++) self.connections[i].dehighlight();
	};
	self.clearConnections = function(){
		for(var i=0;i<self.connections.length;i++){
			self.connections[i].kill();
		}
		self.connections = [];
	};

	// Number of coins
	self.coins = 0;
	self.addPayoff = function(payoff){
		self.coins += payoff;
		self.updateScore();
	};

	// What's the image?
	var g = new PIXI.Container();
	self.graphics = g;

	// Body!
	var body = _makeMovieClip("companytournament_peep");
	body.gotoAndStop(C_PEEP_METADATA[config.strategy].frame);
	body.scale.set(0.5);
	body.anchor.x = 0.5;
	body.anchor.y = 0.75;
	g.addChild(body);
    
	// Score!
	var textStyle = new PIXI.TextStyle({
	    fontFamily: "FuturaHandwritten",
	    fontSize: 16,
	    fill: "#444"
	});
	var scoreText = new PIXI.Text("", textStyle);
	scoreText.anchor.x = 0.5;
	g.addChild(scoreText);
	self.updateScore = function(){
		scoreText.visible = true;
		scoreText.text = self.coins;
	};
	self.updateScore();
	scoreText.visible = false;
	listen(self, "companytournament/reproduce",function(){
		scoreText.visible = false;
	});

	// What's the play logic?
	var LogicClass = window["Logic_"+self.strategyName];
	self.logic = new LogicClass();
	self.play = function(){
		return self.logic.play();
	};
	self.remember = function(own, other){
		self.logic.remember(own, other);
	};

	// Reset!
	self.resetCoins = function(){
		self.coins = 0; // reset coins;
		self.updateScore();
	}
	self.resetLogic = function(){
		self.logic = new LogicClass(); // reset logic
	};

    self.getScore = function(){
        return self.coins;
    };
	// Tween angle...
	self.tweenAngle = function(t){
		self.angle = self.gotoAngle*t + self.angle*(1-t);
	};
	self.updatePosition = function(){
		g.x = Math.cos(self.angle)*200 + 250;
		g.y = Math.sin(self.angle)*200 + 265;
		scoreText.x = -Math.cos(self.angle)*40;
		scoreText.y = -Math.sin(self.angle)*48 - 22;
		body.scale.x = Math.abs(body.scale.x) * ((Math.cos(self.angle)<0) ? 1 : -1);
	};
	self.updatePosition();

	// ELIMINATE
	self.eliminate = function(){

		// INSTA-KILL ALL CONNECTIONS
		self.clearConnections();
		scoreText.visible = false;

		// Tween -- DIE!
		var duration = self.companytournament.isAutoPlaying ? 0.13 : 0.3;
		Tween_get(g).to({
			alpha: 0,
			x: g.x+Math.random()*20-10,
			y: g.y+Math.random()*20-10,
			rotation: Math.random()*0.5-0.25
		}, _s(duration), Ease.circOut).call(self.kill);

	};

	// KILL (actually insta-remove)
	self.kill = function(){

		// Remove ANY tweens
		Tween.removeTweens(g);
		
		// NOW remove graphics.
		g.parent.removeChild(g);

		// AND remove self from companytournament
		self.companytournament.actuallyRemoveAgent(self);

		// Unsub
		unlisten(self);

	};

}

