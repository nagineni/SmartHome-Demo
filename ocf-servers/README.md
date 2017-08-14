# The Smart Devices (aka OCF servers)
## JavaScript OCF servers
A number of JavaScript-based OCF servers are provided in the [`js-servers`](./js-servers/) and [`zjs-servers`](./zjs-servers/) folders for `node.js` and [`zephyr.js`](https://github.com/01org/zephyr.js) respectively. The `node.js` dependencies (that can be installed using `npm`) are:
* [IoTivity-node](https://www.npmjs.com/package/iotivity-node)
* [lodash.mergewith](https://www.npmjs.com/package/lodash.mergewith)
* [lodash.assignin](https://www.npmjs.com/package/lodash.assignin)
* [mraa](https://www.npmjs.com/package/mraa)
* [noble](https://www.npmjs.com/package/noble) (only for some)
* [uuid](https://www.npmjs.com/package/uuid)

## Docker container startup script
The [`start-ocf-servers-in-docker.sh`](./start-ocf-servers-in-docker.sh) script is used when building a Docker container that runs Smart Devices (sensors) as OCF servers. These IoT Smart Devices are simulated devices implemented by the scripts in the `ocf-servers/js-servers/` folder. All scripts accept the `-s` (or `--simulation`) argument that forces them to start in simulation mode, this is what we use when running in a Docker container.

For more details, please take a look at the [Dockerfile](./Dockerfile).

[Docker]: https://www.docker.com/
