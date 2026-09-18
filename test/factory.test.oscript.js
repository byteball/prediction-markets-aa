// uses `aa-testkit` testing framework for AA tests. Docs can be found here `https://github.com/valyakin/aa-testkit`
// `mocha` standard functions and `expect` from `chai` are available globally
// `Testkit`, `Network`, `Nodes` and `Utils` from `aa-testkit` are available globally too
const { expect } = require('chai');
const path = require('path');
const moment = require('moment');

describe('Check factory: token and tokenless markets', function () {
	this.timeout(120000)

	before(async () => {
		this.network = await Network.create()
			.with.agent({ aaLib: path.join(__dirname, "../aa-lib.oscript") })
			.with.agent({ predictionBaseAgent: path.join(__dirname, "../agent.oscript") })
			.with.agent({ predictionTokenlessAgent: path.join(__dirname, "../agent-tokenless.oscript") })
			.with.agent({ predictionFactoryAgent: path.join(__dirname, "../factory.oscript") })
			.with.wallet({ alice: { base: 50e9 } })
			.with.wallet({ oracleOperator: 10e9 })
			.run();

		this.alice = this.network.wallet.alice;
		this.aliceAddress = await this.alice.getAddress();

		this.oracleOperator = this.network.wallet.oracleOperator;
		this.oracleOperatorAddress = await this.oracleOperator.getAddress();

		this.factory = this.network.agent.predictionFactoryAgent;
		this.event_date = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;

		this.marketParams = (data = {}) => ({
			oracle: this.oracleOperatorAddress,
			comparison: "==",
			feed_name: "FEED_NAME",
			datafeed_value: "YES",
			event_date: moment.unix(this.event_date).utc().format('YYYY-MM-DDTHH:mm:ss'),
			waiting_period_length: 3 * 24 * 3600,
			reserve_asset: 'base',
			...data
		});

		// triggers the factory and returns everything needed for assertions
		this.createMarket = async (data) => {
			const { unit, error } = await this.alice.triggerAaWithData({
				toAddress: this.factory,
				amount: 20000,
				data: this.marketParams(data)
			});

			expect(error).to.be.null;
			expect(unit).to.be.validUnit;

			const { response } = await this.network.getAaResponseToUnitOnNode(this.alice, unit);

			if (response.bounced)
				return { response };

			const address = response.response.responseVars.prediction_address;
			expect(address).to.be.validAddress;

			const { unitObj } = await this.alice.getUnitInfo({ unit: response.response_unit });
			const definition = unitObj.messages.find(m => m.app === 'definition').payload.definition;
			const payments = Utils.getExternalPayments(unitObj);

			const { vars: marketVars } = await this.alice.readAAStateVars(address);
			const { vars: factoryVars } = await this.alice.readAAStateVars(this.factory);
			const params = factoryVars[`prediction_${address}`];

			return { response, address, definition, payments, marketVars, params };
		};
	});

	it('creates a token market', async () => {
		const { address, definition, payments, marketVars, params } = await this.createMarket();

		this.tokenMarket = address;

		expect(definition[1].base_aa).to.be.equal(this.network.agent.predictionBaseAgent);
		expect(definition[1].params.is_tokenless).to.be.false;

		// the factory funds the asset definition chain
		expect(payments).to.deep.equalInAnyOrder([{ address, amount: 12000 }]);

		// the market defined both assets through the factory callbacks
		expect(marketVars.yes_asset).to.be.validUnit;
		expect(marketVars.no_asset).to.be.validUnit;
		expect(marketVars.draw_asset).to.not.exist;

		expect(params.is_tokenless).to.be.false;
		expect(params.creator).to.be.equal(this.aliceAddress);
		expect(params.yes_asset).to.be.equal(marketVars.yes_asset);
		expect(params.no_asset).to.be.equal(marketVars.no_asset);
		expect(params.draw_asset).to.not.exist;
	});

	it('creates a token market with draw', async () => {
		const { definition, marketVars, params } = await this.createMarket({ allow_draw: true, datafeed_draw_value: 'DRAW' });

		expect(definition[1].base_aa).to.be.equal(this.network.agent.predictionBaseAgent);
		expect(definition[1].params.datafeed_draw_value).to.be.equal('DRAW');

		expect(marketVars.yes_asset).to.be.validUnit;
		expect(marketVars.no_asset).to.be.validUnit;
		expect(marketVars.draw_asset).to.be.validUnit;

		expect(params.draw_asset).to.be.equal(marketVars.draw_asset);
	});

	it('creates a tokenless market', async () => {
		const { address, definition, payments, marketVars, params } = await this.createMarket({ is_tokenless: true });

		this.tokenlessMarket = address;

		expect(definition[1].base_aa).to.be.equal(this.network.agent.predictionTokenlessAgent);
		expect(definition[1].params.is_tokenless).to.be.true;

		// nothing to define, so the factory neither pays nor sends `define`
		expect(payments).to.deep.equal([]);
		expect(marketVars).to.deep.equal({});

		expect(params.is_tokenless).to.be.true;
		expect(params.creator).to.be.equal(this.aliceAddress);
		expect(params.yes_asset).to.not.exist;
		expect(params.no_asset).to.not.exist;
		expect(params.draw_asset).to.not.exist;
	});

	it('creates a tokenless market with draw', async () => {
		const { definition, payments, marketVars, params } = await this.createMarket({ is_tokenless: true, allow_draw: true, datafeed_draw_value: 'DRAW' });

		expect(definition[1].base_aa).to.be.equal(this.network.agent.predictionTokenlessAgent);
		expect(definition[1].params.allow_draw).to.be.true;
		expect(definition[1].params.datafeed_draw_value).to.be.equal('DRAW');

		expect(payments).to.deep.equal([]);
		expect(marketVars).to.deep.equal({});

		expect(params.is_tokenless).to.be.true;
		expect(params.draw_asset).to.not.exist;
	});

	it('token and tokenless markets with the same params get different addresses', async () => {
		expect(this.tokenMarket).to.not.be.equal(this.tokenlessMarket);
	});

	it('rejects a duplicate tokenless market', async () => {
		const { response } = await this.createMarket({ is_tokenless: true });

		expect(response.bounced).to.be.true;
		expect(response.response.error.message).to.be.equal(`such a prediction already exists: ${this.tokenlessMarket}`);
	});

	it('rejects a duplicate token market', async () => {
		const { response } = await this.createMarket();

		expect(response.bounced).to.be.true;
		expect(response.response.error.message).to.be.equal(`such a prediction already exists: ${this.tokenMarket}`);
	});

	it('rejects a non-boolean is_tokenless', async () => {
		for (const is_tokenless of ["true", 1]) {
			const { response } = await this.createMarket({ is_tokenless, feed_name: "OTHER_FEED" });

			expect(response.bounced).to.be.true;
			expect(response.response.error.message).to.be.equal("is_tokenless must be boolean");
		}
	});

	it('ignores asset callbacks from a non-market address', async () => {
		const { unit, error } = await this.alice.triggerAaWithData({
			toAddress: this.factory,
			amount: 10000,
			data: { type: 'yes_asset' }
		});

		expect(error).to.be.null;
		expect(unit).to.be.validUnit;

		const { response } = await this.network.getAaResponseToUnitOnNode(this.alice, unit);

		// no `prediction_<address>` var for Alice, so the trigger falls into the creation case and fails validation there
		expect(response.bounced).to.be.true;
		expect(response.response.error.message).to.be.equal("oracle isn't valid");
	});

	it('token market is tradable right after creation', async () => {
		const amount = 1e8;

		const { unit, error } = await this.alice.triggerAaWithData({
			toAddress: this.tokenMarket,
			amount: amount + 1e4,
			data: { type: 'yes' }
		});

		expect(error).to.be.null;
		expect(unit).to.be.validUnit;

		const { response } = await this.network.getAaResponseToUnitOnNode(this.alice, unit);
		expect(response.bounced).to.be.false;

		const { vars } = await this.alice.readAAStateVars(this.tokenMarket);
		const { unitObj } = await this.alice.getUnitInfo({ unit: response.response_unit });
		const payments = Utils.getExternalPayments(unitObj);

		// tokens are paid out as an asset, no balance vars
		expect(payments.find(p => p.asset === vars.yes_asset && p.address === this.aliceAddress).amount).to.be.equal(response.response.responseVars.yes_amount);
		expect(vars[`balance_${this.aliceAddress}`]).to.not.exist;
		expect(vars.supplies.yes).to.be.equal(response.response.responseVars.yes_amount);
	});

	it('tokenless market is tradable right after creation', async () => {
		const amount = 1e8;

		const { unit, error } = await this.alice.triggerAaWithData({
			toAddress: this.tokenlessMarket,
			amount: amount + 1e4,
			data: { type: 'yes' }
		});

		expect(error).to.be.null;
		expect(unit).to.be.validUnit;

		const { response } = await this.network.getAaResponseToUnitOnNode(this.alice, unit);
		expect(response.bounced).to.be.false;

		const { vars } = await this.alice.readAAStateVars(this.tokenlessMarket);

		// tokens live in the balance var, nothing is paid out
		expect(response.response_unit).to.be.null;
		expect(vars[`balance_${this.aliceAddress}`].yes).to.be.equal(response.response.responseVars.yes_amount);
		expect(vars.supplies.yes).to.be.equal(response.response.responseVars.yes_amount);
		expect(vars.yes_asset).to.not.exist;
	});

	after(async () => {
		await this.network.stop()
	})
})
