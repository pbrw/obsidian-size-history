import { App, Modal, Plugin } from 'obsidian';
import chartXkcd from 'chart.xkcd';

const EMPTY_HISTORY: SizeHistory = {
	datapoints: [],
}
const MS_IN_MINUTE: number = 60 * 1000;
const MS_IN_DAY: number = 24 * 60 * MS_IN_MINUTE;

interface Datapoint {
	day: string,
	size: number
}

interface SizeHistory {
	datapoints: Datapoint[]
}

export default class SizeHistoryPlugin extends Plugin {

	async onload() {
		this.app.workspace.onLayoutReady(async () => {
			await this.updateHistory();
			this.registerInterval(window.setInterval(async () => await this.updateHistory(), MS_IN_MINUTE));
		});

		this.addRibbonIcon('line-chart', 'Vault size history', async (evt: MouseEvent) => {
			const history = await this.updateHistory();
			new SizeHistoryModal(this.app, history).open();
		});
	}

	async updateHistory(): Promise<SizeHistory> {
		const history = await this.getHistory();
		const latestTimestamp = this.getLatestTimeMs(history);
		const allFiles = this.app.vault.getFiles();
		const unregisterdFiles = allFiles.filter(value => value.stat.ctime > latestTimestamp + MS_IN_DAY);
		unregisterdFiles.sort((a, b) => (a.stat.ctime - b.stat.ctime));
		for (const file of unregisterdFiles) {
			const creationTime = file.stat.ctime;
			const date = new Date(creationTime);
			const dp: Datapoint = {
				day: date.toISOString().substring(0, 10),
				size: 1
			};
			const last = history.datapoints.last();
			if (!last) {
				history.datapoints.push(dp);
				continue;
			}

			if (last.day == dp.day) {
				last.size++;
			} else {
				dp.size = last.size + 1;
				history.datapoints.push(dp);
			}
		}
		const currentDatapoint = {
			day: new Date().toISOString().substring(0, 10),
			size: allFiles.length
		};

		const last = history.datapoints.last();
		if (!last) {
			history.datapoints.push(currentDatapoint);
			return history;
		}

		if (last.day == currentDatapoint.day) {
			last.size = allFiles.length;
		} else {
			history.datapoints.push(currentDatapoint);
		}

		await this.saveData(history);

		return history;
	}

	async getHistory(): Promise<SizeHistory> {
		return Object.assign({}, EMPTY_HISTORY, await this.loadData());
	}

	getLatestTimeMs(history: SizeHistory): number {
		const lastEnpoint = history.datapoints.last();
		if (!lastEnpoint) {
			return -1;
		}
		const date = new Date(lastEnpoint.day);
		return date.getTime();
	}
}

class SizeHistoryModal extends Modal {
	history: SizeHistory;

	constructor(app: App, history: SizeHistory) {
		super(app);
		this.history = history;
	}

	onOpen() {
		const {modalEl, contentEl, titleEl} = this;
		titleEl.setText("Vault size history")
		modalEl.addClass("size-history-modal");
		const div = contentEl.createEl("div", { cls: "size-history-chart"});
		const svg = contentEl.createSvg("svg", { cls: "line-chart"})
		div.appendChild(svg);
		contentEl.appendChild(div);

		const svgLine = document.querySelector<SVGElement>('.line-chart');
		if (!svgLine) {
			return;
		}
		new SizeHistoryChart(svgLine, this.history.datapoints, this.app.vault.getName());
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SizeHistoryChart {
	svgElem: SVGElement;
	datapoints: Datapoint[];
	vaultName: string

	constructor(svgElem: SVGElement, datapoints: Datapoint[], vaultName: string) {
		const data = []
		for (const value of datapoints) {
			data.push({x: value.day, y: value.size});
		}
		new chartXkcd.XY(svgElem, {
			title: 'Vault size',
			xLabel: 'Date',
			yLabel: 'Number of files',
			data: {
				datasets: [{
					label: vaultName,
					data: data,
				}],
			},
			options: {
				xTickCount: 10,
				yTickCount: 10,
				dotSize: 0.5,
				showLine: true,
				timeFormat: 'MM-DD-YYYY',
			},
		});
	}
}