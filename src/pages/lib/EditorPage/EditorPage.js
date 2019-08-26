import MonacoEditor from 'vue-monaco'
import debounce from 'lodash/debounce'
import get from 'lodash/get'
import { mapActions, mapState, mapGetters } from 'vuex'
import monacoLanguages from 'src/languages'
import { AgentControls } from 'src/components'
import { ValidationError, ParsingError } from 'src/errors'

/* eslint-disable-next-line no-undef */
const config = __APP_CONFIG__
const explorerUrl = config.explorer.url
const ojson = monacoLanguages['ojson']

export default {
	components: {
		MonacoEditor,
		AgentControls
	},
	data () {
		return {
			serializedOjson: '',
			language: ojson.id,
			code: '',
			template: '',
			doNotUpdateAgentText: true,
			resultMessage: '',
			resultPaneOpened: false,
			resultPaneEditorOptions: {
				lineNumbers: 'off',
				readOnly: true,
				scrollBeyondLastLine: false,
				automaticLayout: true,
				minimap: {
					enabled: false
				}
			},
			resultPaneModelOptions: {
				tabSize: 1
			},
			editorOptions: {
				wordWrap: 'on',
				wrappingIndent: 'same',
				scrollBeyondLastLine: false,
				automaticLayout: true
			}
		}
	},
	watch: {
		code () {
			if (this.doNotUpdateAgentText) {
				this.doNotUpdateAgentText = false
			} else {
				this.updateAgentText(this.code)
			}
			this.debouncedCodeChanged()
		}
	},
	created () {
		this.debouncedCodeChanged = debounce(this.codeChanged, 500, { trailing: true })
		this.code = this.selectedAgent.text || ''
	},
	mounted () {
		this.switchEditorWrapLines(this.wrapLines)
	},
	computed: {
		...mapState({
			theme: state => state.ui.settings.theme,
			wrapLines: state => state.ui.settings.wrapLines,

			templates: state => state.agents.templates,
			userAgents: state => state.agents.userAgents
		}),
		...mapGetters({
			selectedAgent: 'agents/selectedAgent',
			isSelectedAgentUser: 'agents/isSelectedAgentUser',
			isSelectedAgentTemplate: 'agents/isSelectedAgentTemplate'
		}),
		badge () {
			switch (config.mode) {
			case 'development':
				return 'develop'
			case 'testnet':
				return 'testnet'
			default:
				return ''
			}
		}
	},
	methods: {
		...mapActions({
			parseOjson: 'grammars/parseOjson',
			validateAa: 'grammars/validateOjson',

			changeSelectedAgent: 'agents/changeSelected',
			createNewAgent: 'agents/createNewAgent',
			deleteUserAgent: 'agents/deleteAgent',
			renameUserAgent: 'agents/renameAgent',
			updateAgentText: 'agents/updateText',

			setWrapLines: 'ui/setWrapLines',
			setTheme: 'ui/setTheme',

			deployAa: 'backend/deploy'
		}),
		async codeChanged () {
			this.serializedOjson = ''
			this.resultMessage = ``

			if (this.code !== '') {
				try {
					this.serializedOjson = JSON.stringify(await this.parseOjson(this.code))
				} catch (e) {
					this.openResultPane()
					this.resultMessage = e.message
				}
			}
		},
		async deploy () {
			this.resultMessage = ''
			await this.codeChanged()

			if (this.serializedOjson !== '') {
				this.openResultPane()
				try {
					const result = await this.deployAa(this.serializedOjson)
					const unit = get(result, 'result.unit', null)
					const definitionMessage = get(unit, 'messages', []).find(m => m.app === 'definition')
					this.resultMessage = 'Success\n' +
						(unit ? `Check in explorer: ${explorerUrl}#${unit.unit}\n` : '') +
						(definitionMessage ? `Agent address: ${definitionMessage.payload.address}` : '')
				} catch (e) {
					this.resultMessage = e.response ? get(e, 'response.data.error', 'Unexpected error') : e.message
				}
			}
		},
		async validate () {
			this.resultMessage = ''
			await this.codeChanged()

			if (this.serializedOjson !== '') {
				this.openResultPane()
				try {
					const body = await this.validateAa(this.serializedOjson)
					const result = body ? 'AA validated, complexity = ' + body.complexity + ', ops = ' + body.count_ops : 'AA validated'
					this.resultMessage = 'Success\n' + result
				} catch (e) {
					if (e instanceof ValidationError) { this.resultMessage = e.message }
					if (e instanceof ParsingError) { this.resultMessage = e.message }
					this.resultMessage = e.message
				}
			}
		},
		async handleTemplateSelect (event) {
			const selected = event.target.value
			await this.changeSelectedAgent(selected)
			this.doNotUpdateAgentText = true
			this.code = this.selectedAgent.text
			this.$refs.editor.getMonaco().setScrollPosition({ scrollTop: 0 })
			this.resultMessage = ''
		},
		handleWrapLinesCheckbox () {
			const newWrapLines = !this.wrapLines
			this.switchEditorWrapLines(newWrapLines)
			this.setWrapLines(newWrapLines)
		},
		switchEditorWrapLines (wrapLines) {
			if (wrapLines) {
				this.$refs.editor.getMonaco().updateOptions({ wordWrap: 'on' })
			} else {
				this.$refs.editor.getMonaco().updateOptions({ wordWrap: 'off' })
			}
		},
		handleThemeSelect (event) {
			const theme = event.target.value
			this.setTheme(theme)
		},
		async handleAgentActionNew () {
			await this.createNewAgent({ label: 'New Agent' })
			this.doNotUpdateAgentText = true
			this.code = this.templates[0].text
		},
		async handleAgentActionDelete () {
			await this.deleteUserAgent(this.selectedAgent.id)
			this.doNotUpdateAgentText = true
			this.code = this.selectedAgent.text
		},
		async handleAgentActionRename (newLabel) {
			await this.renameUserAgent({ id: this.selectedAgent.id, newLabel })
		},
		openResultPane () {
			if (!this.resultPaneOpened) {
				this.resultPaneOpened = true
				this.$nextTick(() => {
					this.$refs.resultPaneEditor.getMonaco().getModel().updateOptions(this.resultPaneModelOptions)
				})
			}
		}
	}
}
