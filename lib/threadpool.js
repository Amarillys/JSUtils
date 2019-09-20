/* eslint-env node */
const fs = require('fs');
class ThreadPool {
    constructor(poolSize) {
        this.size = poolSize || 20;
        this.running = 0;
        this.waittingTasks = [];
        this.callback = [];
        this.tasks = [];
        this.counter = 0;
        this.sum = 0;
        this.finished = false;
        this.errorLog = '';
        this.step = () => {};
        this.timer = null;
        this.callback.push(() => fs.writeFile('pool-error.log', this.errorLog, () => {}));
    }

    status () {
        return (this.counter / this.sum * 100).toFixed(1) + '%';
    }

    run () {
        if (this.finished)
            return;
        if (this.waittingTasks.length === 0)
            if (this.running <= 0) {
                for (let m = 0; m < this.callback.length; ++m)
                    this.callback[m] && this.callback[m]();
                this.finished = true;
            }
            else
                return;

        while (this.running < this.size) {
            if (this.waittingTasks.length === 0)
                return;
            let curTask = this.waittingTasks[0];
            curTask.do().then(
                onSucceed => {
                    this.running--;
                    this.counter++;
                    this.step();
                    this.run();
                    typeof onSucceed === 'function' && onSucceed();
                }, onFailed => {
                    this.errorLog += onFailed + '\n';
                    this.running--;
                    this.counter++;
                    this.step();
                    this.run();
                    curTask.err();
                }
            );
            this.waittingTasks.splice(0, 1);
            this.tasks.push(this.waittingTasks[0]);
            this.running++;
        }
    }

    add (fn, errFn) {
        this.waittingTasks.push({ do: fn, err: errFn || (() => {}) });
        this.sum++;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.run();
            clearTimeout(this.timer);
        }, this.autoStartTime);
    }

    setAutoStart(time) {
        this.autoStartTime = time;
    }

    finish(callback) {
        this.callback.push(callback);
    }

    isFinished() {
        return this.finished;
    }
}

module.exports = ThreadPool;
