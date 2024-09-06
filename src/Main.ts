import mapManager from "./configs/mapManager";
import SocketHelper from "./utils/SocketHelper";

const Stage = Laya.Stage;
const Event = Laya.Event;
const Image = Laya.Image;
const HBox = Laya.HBox;
const VBox = Laya.VBox;


const {regClass, property} = Laya;
const dataManager = new mapManager();

@regClass()
export default class Main extends Laya.Script {
	@property({type: Laya.Button})
	public startBtn: Laya.Button;
	@property({type: Laya.Sprite})
	public optionsSpe: Laya.Button;
	
	@property({type: Laya.Image})
	public passBtn: Laya.Image;
	@property({type: Laya.Image})
	public bumpBtn: Laya.Image;
	@property({type: Laya.Image})
	public gangBtn: Laya.Image;
	@property({type: Laya.Image})
	public winningBtn: Laya.Image;
	
	// declare owner : Laya.Sprite;
	//ws实例
	public _socket: SocketHelper;
	private avatarImg: string = "resources/apes/avatar.png";
	private rightInHand: string = "resources/apes/right_inhand_0.png";
	private oppositeInHand: string = "resources/apes/opposite_inhand_0.png";
	private leftInHand: string = "resources/apes/left_inhand_0.png";
	private playerNum: number = 0;
	private viewPos: Array<number> = [];
	
	private cardIdx: number;
	private tableCards: number[] = [];
	private playedCards: any;   //出在桌上的牌（这里需要分用户绘制，还是用 map结构）
	
	private activeCard: Laya.Image;    //用户当前操作的牌
	
	
	private myCardImgs: Array<Laya.Image> =[];
	private allUiCards: Array<Laya.Image> =[];   // 存储所有牌的UI节点，方便特殊操作
	
	onStart() {
		// this.renderAvatar()
	}
	
	/**
	 * 场景启动
	 */
	onAwake(): void {
		const userInfo = dataManager.getData("userInfo");
		const roomInfo = dataManager.getData("roomInfo");
		this._socket = SocketHelper.getInstance("");
		Laya.stage.on(Event.FOCUS, this, () => {
			this.optionsSpe.visible = false;
		})
		
		if(roomInfo && userInfo?.id === Object.keys(roomInfo)[0]){ //我是房主，可以开始游戏
			this.startBtn.visible = true;
		}
		this.startBtn.on(Event.CLICK, this, this.startGame)
	}
	
	/**
	 * 绘制头像
	 * @param viewPos
	 * @param idx
	 * @private
	 */
	private renderAvatar(viewPos: number[], idx: number): void {
		const userInfo = dataManager.getData("userInfo");
		let avatar: Laya.Image = new Image(this.avatarImg);
		avatar.width = 100;
		avatar.height = 100;
		let x: number, y: number = 0;
		if (viewPos[idx] === 0) { // 玩家本人位置
			x = 100;
			y = Laya.stage.designHeight - avatar.height - 30
		} else if(viewPos[idx] === 1) {
			x = Laya.stage.designWidth - avatar.width - 30;
			y = Laya.stage.designHeight/2 - avatar.height/2;
		} else if(viewPos[idx] === 2){
			x = Laya.stage.designWidth/2 - avatar.width/2;
			y = 30;
		} else if(viewPos[idx] === 3){
			x = 30;
			y = Laya.stage.designHeight/2 - avatar.height/2;
		}
		avatar.pos(x, y);
		this.owner.addChild(avatar);
	}
	
	
	/**
	 * 玩家视角的座位算法
	 * 原理如下
	 * 玩家A、B、C、D 座位如下
	   A-0 B-1 -2 D-3
			
			首先获取所有玩家的服务器位置：Index = 0，1，2，3
			加入现在是B的视角
			则：移位 = B.index 1 - 0 = 1 ，说明移动一个位置
			新座位的序号：
			B = B.index - 移位 = 1-1 = 0
			C = C.index - 移位 = 2-1 = 1
			D = D.index - 移位 = 3-1 = 2
			A = A.index - 移位 = 0 - 1 = -1，如果是负数，则+总人数4：-1+4=3
			
			同理：C的视角
			移位= C.index 2-0 = 2
			C = C.index - 移位 = 2-2 = 0
			D = D.index - 移位 = 3-2 = 1
			A = A.index - 移位 = 0 - 2 = -2，如果是负数，则+总人数4：-2+4=2
			B = B.index - 移位 = 1 - 2 = -1，如果是负数，则+总人数4：-1+4=3
			
			同理：D的视角
			移位= D.index 3-0 = 3
			D = D.index - 移位 = 3 - 3 = 0
			A = A.index - 移位 = 0 - 3 = -3，如果是负数，则+总人数4：-3+4=1
			B = B.index - 移位 = 1 - 3 = -2，如果是负数，则+总人数4：-2+4=2
			C = C.index - 移位 = 2 - 3 = -1，如果是负数，则+总人数4：-1+4=3
	 */
	private getPlayerViewPos(move: number, keys: Array<string>): Array<number> {
		return keys.map((k, idx)=>{
			return this.getViewPos(idx,move,keys.length);
		})
	}
	
	/**
	 * 获取单个客户端位置（参照视角玩家）
	 * @param pos 视角玩家的服务端位置
	 * @param move 视角玩家调整到靠显示器一侧的移位
	 * @param len 玩家数量
	 */
	getViewPos(pos: number, move: number, len: number): number {
		return pos - move >= 0 ? pos - move : pos - move + len;
	}
	
	/**
	 * 绘制全部玩家头像
	 * @private
	 */
	private renderAllPlayer(roomInfo: any): void {
		const userInfo = dataManager.getData("userInfo");
		if (!roomInfo || JSON.stringify(roomInfo) === "{}") return
		const keys = Object.keys(roomInfo);
		this.playerNum = keys?.length;
		const meIdx: number = keys.findIndex(o => o == userInfo?.id);
		
		const viewPos: Array<number> = this.viewPos = this.getPlayerViewPos(meIdx, keys)
		
		keys.map((o, idx)=>{
			this.renderAvatar(viewPos, idx)
		})
		// todo 此处自动判断4个人到房间开始，实际场景可能需要4人准备，房主点击开始，后期找到UI再优化
		if(keys.length === 2){
			this.startGame();
		}
	}
	
	/**
	 * 开始游戏
	 * @private
	 */
	startGame(): void {
		const roomInfo = dataManager.getData("roomInfo");
		const userInfo = dataManager.getData("userInfo");
		const room = roomInfo[userInfo?.id];
		if (!room?.isHomeOwner) { // 仅有房主能开始游戏
			return
		}
		const keys = Object.keys(roomInfo);
		this.playerNum = keys?.length;
		const meIdx: number = keys.findIndex(o => o == userInfo?.id);
		const viewPos: Array<number> = this.viewPos = this.getPlayerViewPos(meIdx, keys)
		const roomId = roomInfo[userInfo?.id]?.roomId;
		this._socket.sendMessage(JSON.stringify({type: "startGame", roomId}))
		this.startBtn.visible = false;
	}
	
	
	/**
	 * 获取手牌的图片资源
	 */
	getHandCardImageUrl(num: number): string{
		let unit = num % 50 > 30 ? "b" : num % 50 > 20 ? 't' : num % 50 > 10 ? "w" : '';
		let unitNum = (num % 50)%10;
		return `resources/apes/${unit}${unitNum}.png`
	}
	
	/**
	 * 获取打出去的牌的图片资源
	 * @param num
	 * @param viewPosNum
	 */
	getPlayedCardsImageUrl(num: number, viewPosNum: number): string{
		console.log(num, '===============', viewPosNum)
		const unit = num % 50 > 30 ? "b" : num % 50 > 20 ? 't' : num % 50 > 10 ? "w" : '';
		const unitNum = (num % 50)%10;
		const posFolder = viewPosNum === 0 ? 'first' : viewPosNum === 1 ? 'second' : viewPosNum === 2 ? 'third' : viewPosNum === 3 ? 'fourth' : "";
		return `resources/apes/${posFolder}/b${unit}${unitNum}.png`
	}
	
	
	/**
	 * 绘制手牌
	 */
	renderHandCards(idx: number, handCards: number[]): void{
		console.log(handCards, '====================================')
		this.myCardImgs = [];
		let img: Laya.Image;
		// 按客户端玩家视角绘制手牌
		if (this.viewPos[idx] === 0) { // 玩家本人位置
			let hbox:any = this.owner.getChildByName(`hbox${idx}`);
			if (hbox) {
				hbox?.destroy(true);
				hbox = new HBox()
			} else {
				hbox = new HBox()
			}
			let firstX = 250, firstY = Laya.stage.designHeight - 99 - 30;
			let imgs: Laya.Image[] = handCards.map((h: number, childIdx: number) => {
				let imgUrl = this.getHandCardImageUrl(h);
				let img = new Image(imgUrl);
				hbox.name = `hbox${idx}`;
				img.name = "myCard";
				this.myCardImgs.push(img);
				img.on(Event.CLICK, this, this.handleCardClick, [firstY, `hbox${idx}`, childIdx, h])
				hbox.pos((Laya.stage.designWidth - handCards.length * 65) / 2, firstY);
				hbox.addChild(img)
				return img;
			})
			this.owner.addChild(hbox);
		} else if (this.viewPos[idx] === 1) {
			let firstX = Laya.stage.designWidth - 100 - 30 - 26 - 30, firstY = 200;
			handCards.map((h: number, childIdx: number) => {
				img = new Image(this.rightInHand);
				img.pos(firstX, firstY + 22 * childIdx);
				this.owner.addChild(img);
			})
		} else if (this.viewPos[idx] === 2) {
			let firstX = 370, firstY = 100 + 30 + 30;
			handCards.map((h: number, childIdx: number) => {
				img = new Image(this.oppositeInHand);
				img.pos(firstX + childIdx * 44, firstY);
				this.owner.addChild(img);
			})
		} else if (this.viewPos[idx] === 3) {
			let firstX = 100 + 30 + 30, firstY = 200;
			handCards.map((h: number, childIdx: number) => {
				img = new Image(this.leftInHand);
				img.pos(firstX, firstY + 22 * childIdx);
				this.owner.addChild(img);
			})
		}
	}
	
	/**
	 * 选中牌
	 * @param y
	 * @param name
	 * @param childIdx
	 * @param cardNum
	 * @private
	 */
	private handleCardClick(y: number, name: string, childIdx: number, cardNum: number): void {
		const hbox = this.owner.getChildByName(name);
		const cardNode: any = hbox.getChildAt(childIdx);
		if (cardNode.y === 0) {
			cardNode.y = cardNode.y - 50;
		} else {
			this.activeCard = cardNode;
			this.handleCardPlay(cardNum)
		}
	}
	
	/**
	 * 出牌
	 */
	handleCardPlay(cardNum: number): void{
		// todo 首先判断现在的出牌顺位是否是我
		const roomInfo = dataManager.getData("roomInfo");
		const userInfo = dataManager.getData("userInfo");
		const roomId = roomInfo[userInfo?.id]?.roomId;
		this._socket.sendMessage(JSON.stringify({type: "playCard", data: {roomId, cardNum, userId: userInfo?.id}}))
	}
	
	/**
	 * 绘制打出去的牌
	 */
	renderPlayedCards(cardNum: number, playerId: string, roomInfo: any): void {
		console.log(cardNum, playerId, '========')
		const playerCards = roomInfo[playerId]?.playedCards;
		const keys = Object.keys(roomInfo);
		const idx = keys?.findIndex(o=> o === playerId);
		if (this.viewPos[idx] === 0) {
			const hbox = new HBox();
			playerCards?.map((k: number, childIdx: number) => {
				let imgUrl = this.getPlayedCardsImageUrl(k, this.viewPos[idx]);
				let img = new Image(imgUrl);
				img.name = `playedCard${childIdx}`;
				hbox.pos(400, Laya.stage.designHeight - 99 - 30 - 160);
				hbox.size(540, 120);
				hbox.addChild(img)
			})
			this.owner.addChild(hbox)
		} else if (this.viewPos[idx] === 1) {
			const vbox = new VBox;
			playerCards?.map((k: number, childIdx: number) => {
				let imgUrl = this.getPlayedCardsImageUrl(k, this.viewPos[idx]);
				let img = new Image(imgUrl);
				img.name = `playedCard${childIdx}`;
				vbox.pos(Laya.stage.designWidth/2 + 100, Laya.stage.designHeight /2 - 135);
				vbox.size(540, 120);
				vbox.addChild(img)
			})
			this.owner.addChild(vbox)
		} else if (this.viewPos[idx] === 2) {
			const hbox = new HBox();
			playerCards?.map((k: number, childIdx: number) => {
				let imgUrl = this.getPlayedCardsImageUrl(k, this.viewPos[idx]);
				let img = new Image(imgUrl);
				img.name = `playedCard${childIdx}`;
				hbox.pos(400, 160);
				hbox.size(540, 120);
				// hbox.align = "bottom";
				hbox.addChild(img)
			})
			this.owner.addChild(hbox)
		} else if (this.viewPos[idx] === 3) {
			const vbox = new VBox;
			playerCards?.map((k: number, childIdx: number) => {
				let imgUrl = this.getPlayedCardsImageUrl(k, this.viewPos[idx]);
				let img = new Image(imgUrl);
				img.name = `playedCard${childIdx}`;
				vbox.pos(Laya.stage.designWidth/2 - 100, Laya.stage.designHeight /2 - 135);
				vbox.size(540, 120);
				vbox.addChild(img)
			})
			this.owner.addChild(vbox)
		}
	}
	
	/**
	 * 绘制桌上未开的牌
	 */
	renderTableCards(): void{
	
	}
	
	/**
	 * 暂停游戏
	 */
	private pauseGame(): void{}
	
	
	/**
	 * 停止游戏
	 */
	private stopGame(): void {
	}
	
	/**
	 * 已经准备好，开始游戏
	 */
	readyGameStart(): void {
		const userInfo = dataManager.getData("userInfo");
		const roomInfo = dataManager.getData("roomInfo");
		const keys = Object.keys(roomInfo);
		this.playerNum = keys?.length;
		const meIdx: number = keys.findIndex(o => o == userInfo?.id);
		const viewPos: Array<number> = this.viewPos = this.getPlayerViewPos(meIdx, keys)
		// const roomInfo = dataManager.getData("gameInfo");

		keys.map((o, idx) => {
			console.log(roomInfo,'--------------------------------', roomInfo[o]?.handCards)
			this.renderHandCards(idx, roomInfo[o]?.handCards)
		})
	}
	
	
	/**
	 * 绘制手牌
	 */
	
	
	/**
	 * 绘制桌面上的牌
	 */
	
	//每帧更新时执行，尽量不要在这里写大循环逻辑或者使用getComponent方法
	onUpdate(): void {
		// const roomInfo = dataManager.getData("roomInfo");
		// todo 这里似乎放在4个玩家进房之后，websocket的回调里更好， onUpdate逻辑更适合做其他逻辑
		// if (Object.keys(roomInfo).length > this.playerNum) { //玩家数量更新
		// 	this.renderAllPlayer(roomInfo);
		// }
	}
}
