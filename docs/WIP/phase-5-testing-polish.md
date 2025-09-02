# Phase 5: Story-Based Testing & Polish

## 📋 Overview
**Status:** Planned | **Estimate:** 2-3 days | **Priority:** Medium

This phase focuses on comprehensive Story-based testing, performance optimization, and user experience improvements for the completed Map Editor implementation.

## 🎯 Goals
- Comprehensive Story testing of all implemented features
- Performance optimization and monitoring
- UI/UX improvements and polish based on Story feedback
- Documentation and user experience refinement
- Story-based validation of service architecture

## 📝 Detailed Tasks

### 5.1 Story-Based Testing
**Files:** `packages/ui-gjs/src/widgets/**/*.story.ts`, `packages/engine-gjs/src/widgets/**/*.story.ts`

#### Description
Create and validate comprehensive Stories for all UI components and services, replacing traditional unit tests with interactive Story-based testing.

#### Story Testing Coverage
```typescript
// SelectionToolsWidget Story Validation
describe('SelectionToolsWidget Story', () => {
  it('should handle tool selection correctly', async () => {
    const story = new SelectionToolsWidgetStory()
    await story.initialize()

    // Test brush tool selection
    story.updateArgs({ activeTool: EditorTool.Brush })
    expect(story._selectionToolsWidget.currentTool).toBe(EditorTool.Brush)

    // Test signal emission
    const signalSpy = spyOn(story._selectionToolsWidget, 'emit')
    story.updateArgs({ activeTool: EditorTool.Eraser })
    expect(signalSpy).toHaveBeenCalledWith('tool-selected', EditorTool.Eraser)
  })

  it('should handle tool configuration changes', async () => {
    const story = new SelectionToolsWidgetStory()
    await story.initialize()

    // Test brush size configuration
    story.updateArgs({ brushSize: 5 })
    expect(story._selectionToolsWidget.brushSize).toBe(5)

    // Test eraser size configuration
    story.updateArgs({ activeTool: EditorTool.Eraser, eraserSize: 3 })
    expect(story._selectionToolsWidget.eraserSize).toBe(3)
  })
})

// MapEditorService Story Validation
describe('MapEditorService Story Integration', () => {
  it('should handle tile placement workflow', async () => {
    const mockWebView = createMockWebView()
    const service = new MapEditorService(mockWebView, mockTilesetSelector, mockLayerSelector)

    // Setup service state
    service.setSelectedTile(42)
    service.setSelectedLayer('foreground')

    // Simulate tile click
    const result = await service.handleTileClicked({
      coords: new ex.Vector(5, 5)
    })

    expect(result.success).toBe(true)
    expect(mockWebView.rpc.sendRequest).toHaveBeenCalledWith(
      RpcEngineType.TILE_PLACED,
      {
        coords: new ex.Vector(5, 5),
        tileId: 42,
        layerId: 'foreground'
      }
    )
  })
})
```

#### Story Categories
1. **Widget Stories**: Interactive testing of UI components
2. **Service Stories**: Validation of service logic and RPC communication
3. **Integration Stories**: End-to-end workflow testing
4. **Error Stories**: Edge case and error scenario testing
5. **Performance Stories**: Load testing and performance validation

#### Acceptance Criteria
- ✅ All major components have corresponding Stories
- ✅ Stories cover all user interactions and edge cases
- ✅ Interactive controls validate component behavior
- ✅ Signal emission and handling properly tested
- ✅ Mock data provides realistic testing scenarios

#### Implementation Notes
- Stories serve as both documentation and tests
- Interactive controls allow runtime behavior validation
- Console logging helps debug signal flow
- Mock services provide controlled testing environment

### 5.2 Service Architecture Validation
**Files:** `packages/engine-gjs/src/services/**/*.story.ts`

#### Description
Create Stories to validate the service architecture and RPC communication patterns.

#### Service Validation Stories with Needle DI
```typescript
// MapEditorService Story with Needle DI
export class MapEditorServiceStory extends StoryWidget {
  static getMetadata(): StoryMeta {
    return {
      title: 'Services/Map Editor Service',
      description: 'Validation of MapEditorService with Needle DI dependency injection',
      component: MapEditorService.$gtype,
      tags: ['service', 'rpc', 'needle-di'],
      controls: [
        {
          name: 'selectedTileId',
          label: 'Selected Tile ID',
          type: ControlType.RANGE,
          min: 0,
          max: 100,
          defaultValue: 42
        },
        {
          name: 'selectedLayerId',
          label: 'Selected Layer',
          type: ControlType.SELECT,
          options: [
            { label: 'Background', value: 'background' },
            { label: 'Foreground', value: 'foreground' },
            { label: 'Collision', value: 'collision' }
          ],
          defaultValue: 'foreground'
        },
        {
          name: 'simulateTileClick',
          label: 'Simulate Tile Click',
          type: ControlType.BOOLEAN,
          defaultValue: false
        }
      ]
    }
  }

  initialize(): void {
    // Create DI container with mocks for testing
    const container = new Container()

    // Register mock services
    container.register(WebView, { useValue: this.createMockWebView() })
    container.register(TilesetSelector, { useValue: this.createMockTilesetSelector() })
    container.register(LayerSelector, { useValue: this.createMockLayerSelector() })

    // Get service instance - dependencies automatically injected!
    this.service = container.get(MapEditorService)

    // Setup logging for RPC calls
    this.setupRpcLogging(this.service.webView)

    this.add_child(new Gtk.Label({ label: 'MapEditorService Validation (Needle DI)' }))
  }

  updateArgs(args: Record<string, any>): void {
    if (args.selectedTileId !== undefined) {
      this.service.setSelectedTile(args.selectedTileId)
      console.log('Tile selected:', args.selectedTileId)
    }

    if (args.selectedLayerId !== undefined) {
      this.service.setSelectedLayer(args.selectedLayerId)
      console.log('Layer selected:', args.selectedLayerId)
    }

    if (args.simulateTileClick) {
      this.simulateTileClick()
    }
  }

  private simulateTileClick(): void {
    const coords = new ex.Vector(5, 5)
    this.service.handleTileClicked({ coords })
      .then(result => console.log('Tile click result:', result))
      .catch(error => console.error('Tile click error:', error))
  }
}
```

#### Service Validation Areas
1. **RPC Handler Registration**: Verify all handlers are properly registered
2. **State Management**: Test state synchronization between components
3. **Error Handling**: Validate error scenarios and recovery
4. **Dependency Injection**: Ensure proper service initialization
5. **Event Flow**: Test signal emission and handling

#### Acceptance Criteria
- ✅ Service initialization works with dependency injection
- ✅ RPC handlers respond correctly to messages
- ✅ State changes trigger appropriate notifications
- ✅ Error scenarios handled gracefully
- ✅ Clean separation between concerns maintained

#### Implementation Notes
- Mock WebView provides controlled RPC testing
- Console logging helps debug communication flow
- Stories document expected service behavior

### 5.3 Story-Based Performance Validation
**Files:** `packages/ui-gjs/src/widgets/**/*.performance.story.ts`

#### Description
Create performance-focused Stories to validate system responsiveness and identify bottlenecks.

#### Performance Validation Stories
```typescript
// Performance Story for SelectionToolsWidget
export class SelectionToolsWidgetPerformanceStory extends StoryWidget {
  static getMetadata(): StoryMeta {
    return {
      title: 'Performance/Selection Tools',
      description: 'Performance validation for SelectionToolsWidget interactions',
      component: SelectionToolsWidget.$gtype,
      tags: ['performance', 'ui'],
      controls: [
        {
          name: 'rapidToolSwitching',
          label: 'Rapid Tool Switching',
          type: ControlType.BOOLEAN,
          defaultValue: false
        },
        {
          name: 'stressTestTileSelection',
          label: 'Stress Test Tile Selection',
          type: ControlType.BOOLEAN,
          defaultValue: false
        }
      ]
    }
  }

  private performanceMetrics = {
    toolSwitchTime: [] as number[],
    tileSelectionTime: [] as number[],
    memoryUsage: [] as number[]
  }

  initialize(): void {
    this._selectionToolsWidget = new SelectionToolsWidget()

    // Setup performance monitoring
    this.setupPerformanceMonitoring()

    this.add_child(this._selectionToolsWidget)
  }

  updateArgs(args: Record<string, any>): void {
    if (args.rapidToolSwitching) {
      this.runRapidToolSwitchingTest()
    }

    if (args.stressTestTileSelection) {
      this.runTileSelectionStressTest()
    }
  }

  private async runRapidToolSwitchingTest(): Promise<void> {
    const tools = [EditorTool.Brush, EditorTool.Eraser, EditorTool.Fill]
    const iterations = 100

    console.log('Starting rapid tool switching test...')

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now()

      const tool = tools[i % tools.length]
      this._selectionToolsWidget.setActiveTool(tool)

      const endTime = performance.now()
      this.performanceMetrics.toolSwitchTime.push(endTime - startTime)
    }

    this.logPerformanceResults('Tool Switching')
  }

  private async runTileSelectionStressTest(): Promise<void> {
    console.log('Starting tile selection stress test...')

    for (let i = 0; i < 1000; i++) {
      const startTime = performance.now()

      // Simulate rapid tile selection changes
      this._selectionToolsWidget.setSelectedTile(i % 100, this.createMockTexture())

      const endTime = performance.now()
      this.performanceMetrics.tileSelectionTime.push(endTime - startTime)
    }

    this.logPerformanceResults('Tile Selection')
  }

  private logPerformanceResults(testName: string): void {
    const times = this.performanceMetrics.toolSwitchTime
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    const max = Math.max(...times)
    const min = Math.min(...times)

    console.log(`${testName} Performance Results:`)
    console.log(`  Average: ${avg.toFixed(2)}ms`)
    console.log(`  Max: ${max.toFixed(2)}ms`)
    console.log(`  Min: ${min.toFixed(2)}ms`)
    console.log(`  Samples: ${times.length}`)
  }
}
```

#### Performance Validation Areas
1. **UI Responsiveness**: Measure widget interaction times
2. **Memory Usage**: Monitor memory consumption during operations
3. **RPC Latency**: Validate communication performance
4. **Event Handling**: Test event processing efficiency
5. **Rendering Performance**: Check UI update speeds

#### Acceptance Criteria
- ✅ Tool switching < 50ms average response time
- ✅ Tile selection < 100ms for bulk operations
- ✅ Memory usage remains stable during stress tests
- ✅ No UI freezing during rapid interactions
- ✅ Performance meets Story-defined thresholds

#### Implementation Notes
- Use browser performance API for accurate measurements
- Console logging provides detailed performance data
- Stories help identify performance bottlenecks interactively

### 5.4 Story-Driven UI/UX Refinement
**Files:** `packages/ui-gjs/src/widgets/**/*.story.ts`

#### Description
Use Stories to iteratively refine UI/UX based on interactive testing and user feedback.

#### UI Refinement Stories
```typescript
// SelectionToolsWidget UX Story
export class SelectionToolsWidgetUXStory extends StoryWidget {
  static getMetadata(): StoryMeta {
    return {
      title: 'UX/Selection Tools Refinement',
      description: 'Iterative UI/UX refinement for SelectionToolsWidget based on user feedback',
      component: SelectionToolsWidget.$gtype,
      tags: ['ux', 'refinement', 'feedback'],
      controls: [
        {
          name: 'showTooltips',
          label: 'Show Tooltips',
          type: ControlType.BOOLEAN,
          defaultValue: true
        },
        {
          name: 'enableAnimations',
          label: 'Enable Animations',
          type: ControlType.BOOLEAN,
          defaultValue: true
        },
        {
          name: 'colorScheme',
          label: 'Color Scheme',
          type: ControlType.SELECT,
          options: [
            { label: 'Default', value: 'default' },
            { label: 'High Contrast', value: 'high-contrast' },
            { label: 'Dark', value: 'dark' }
          ],
          defaultValue: 'default'
        },
        {
          name: 'simulateAccessibility',
          label: 'Simulate Accessibility',
          type: ControlType.BOOLEAN,
          defaultValue: false
        }
      ]
    }
  }

  initialize(): void {
    this._selectionToolsWidget = new SelectionToolsWidget()

    // Setup UX monitoring
    this.setupUXMonitoring()

    // Add accessibility testing
    this.setupAccessibilityTesting()

    this.add_child(this._selectionToolsWidget)
  }

  updateArgs(args: Record<string, any>): void {
    if (args.showTooltips !== undefined) {
      this._selectionToolsWidget.showTooltips = args.showTooltips
    }

    if (args.enableAnimations !== undefined) {
      this._selectionToolsWidget.animationsEnabled = args.enableAnimations
    }

    if (args.colorScheme !== undefined) {
      this.applyColorScheme(args.colorScheme)
    }

    if (args.simulateAccessibility) {
      this.simulateAccessibilityMode()
    }
  }

  private applyColorScheme(scheme: string): void {
    const cssProvider = new Gtk.CssProvider()

    switch (scheme) {
      case 'high-contrast':
        cssProvider.load_from_data(`
          .tool-button { border: 2px solid black; }
          .selected { background-color: yellow; color: black; }
        `)
        break
      case 'dark':
        cssProvider.load_from_data(`
          .tool-button { background-color: #333; color: white; }
          .selected { background-color: #666; }
        `)
        break
    }

    this._selectionToolsWidget.get_style_context().add_provider(
      cssProvider,
      Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
    )
  }

  private simulateAccessibilityMode(): void {
    // Simulate screen reader interactions
    console.log('Accessibility Mode: Testing keyboard navigation...')

    // Test tab order
    this.testTabNavigation()

    // Test ARIA labels
    this.testAriaLabels()

    // Test focus indicators
    this.testFocusIndicators()
  }

  private testTabNavigation(): void {
    // Simulate tab key presses and verify focus order
    const focusableElements = this.getFocusableElements()
    console.log('Focusable elements:', focusableElements.length)
    console.log('Tab order validated')
  }

  private testAriaLabels(): void {
    // Check that all interactive elements have proper ARIA labels
    const interactiveElements = this.getInteractiveElements()
    interactiveElements.forEach(element => {
      const ariaLabel = element.get_accessible().get_label()
      console.log(`ARIA label for ${element.constructor.name}: ${ariaLabel || 'MISSING'}`)
    })
  }
}
```

#### UI/UX Refinement Areas
1. **Visual Design**: Color schemes, spacing, typography
2. **Interaction Design**: Hover states, animations, feedback
3. **Accessibility**: Keyboard navigation, screen reader support
4. **Performance**: Smooth animations, responsive interactions
5. **User Feedback**: Tooltips, help text, error messages

#### Acceptance Criteria
- ✅ Intuitive visual hierarchy and spacing
- ✅ Smooth animations and transitions
- ✅ Complete keyboard accessibility
- ✅ Screen reader compatibility
- ✅ Multiple color scheme support
- ✅ Clear visual feedback for all interactions

#### Implementation Notes
- Stories allow rapid iteration on UI designs
- Interactive controls test different UX variations
- Console logging helps track accessibility compliance
- Multiple color schemes support different user preferences

## 🔗 Dependencies
- **Phase 3**: MapEditorService and SelectionToolsWidget with Needle DI
- **Phase 4**: Extended tool system with eraser and fill tools
- **Existing Story Infrastructure**: StoryWidget, StoryMeta, ControlType
- **Existing UI Components**: TilesetSelector, LayerSelector, MapEditorPanel
- **Needle DI**: `@needle-di/core` for dependency injection in services

## ✅ Definition of Done
- [ ] Comprehensive Story suite for all components
- [ ] Service architecture validation through Stories
- [ ] Performance benchmarks established via Stories
- [ ] UI/UX refinements completed based on Story feedback
- [ ] Accessibility compliance verified through Stories
- [ ] All acceptance criteria met
- [ ] Final Story review completed

## 📋 Testing Strategy
- **Story-Based Testing**: Interactive validation of all features
- **Service Testing**: Architecture validation through mock environments
- **Performance Testing**: Real-time performance monitoring via Stories
- **UX Testing**: Iterative design refinement through Story controls
- **Accessibility Testing**: Compliance validation through Story simulations

## 🎯 Final Deliverables
After completing Phase 5:
- **Story-Tested Map Editor**: Complete working implementation validated through Stories
- **Service Architecture**: Robust and well-tested service layer
- **Performance Optimized**: Optimized based on Story performance data
- **User Ready**: Polished user experience refined through Story feedback
- **Documented**: Complete Story documentation for maintenance

## 📊 Quality Metrics
- **Story Coverage**: All major features covered by Stories
- **Performance**: < 50ms average response times validated via Stories
- **Accessibility**: WCAG 2.1 AA compliant verified through Stories
- **User Experience**: Intuitive and responsive validated through Stories
- **Service Architecture**: Clean dependency injection and RPC handling

---
*Focus on Story-based validation and refinement. Stories serve as both tests and documentation, ensuring quality and maintainability.*
