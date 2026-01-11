<script lang="ts">
	import './layout.css';
	import { Button } from '$lib/components/ui/button';
	import * as Sheet from '$lib/components/ui/sheet';
	import { Calendar, LayoutGrid, SquareCheckBig, PanelLeft, User, Inbox } from 'lucide-svelte';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import TDAgenda from '$lib/components/TDAgenda.svelte';
	import Sidebar from './Sidebar.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { buttonVariants } from '$lib/components/ui/button';

	let sidebarOverlay = false;
	let sidebarOpen = false;
</script>

<div class="flex h-screen overflow-hidden bg-background text-foreground">
	<div
		class="h-screen w-0 overflow-hidden border-border bg-background text-foreground transition-all"
		class:w-64={sidebarOpen}
		class:border-r={sidebarOpen}
	>
		<Sidebar />
	</div>

	<Sheet.Root bind:open={sidebarOverlay}>
		<Sheet.Content side="left" class="w-72 px-5 py-5">
			<Sheet.Header>
				<Sheet.Title class="text-left">Workspaces</Sheet.Title>
			</Sheet.Header>

			<div class="mt-8 flex flex-col gap-4">
				<Button variant="secondary" class="w-full justify-start">Personal</Button>
				<Button variant="ghost" class="w-full justify-start text-muted-foreground">School</Button>
				<Button variant="ghost" class="w-full justify-start text-muted-foreground"
					>+ New Workspace</Button
				>
			</div>
		</Sheet.Content>
	</Sheet.Root>

	<div class="relative flex h-full flex-1 flex-col">
		<header class="flex items-center justify-between px-6 py-4">
			<Button variant="ghost" size="icon" onclick={() => (sidebarOpen = !sidebarOpen)}>
				<PanelLeft size={20} />
			</Button>

			<div class="flex-1"></div>

			<Avatar
				class="h-8 w-8 cursor-pointer ring-offset-background transition-all hover:ring-2 hover:ring-ring"
			>
				<AvatarImage src="https://github.com/shadcn.png" alt="User" />
				<AvatarFallback><User /></AvatarFallback>
			</Avatar>
		</header>

		<main class="relative flex-1 overflow-y-auto">
			<div class="absolute top-1/2 left-3 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
				<Tooltip.Provider disableHoverableContent={true}>
					<Tooltip.Root>
						<Tooltip.Trigger
							class={buttonVariants({
								variant: 'secondary',
								size: 'icon',
								class: 'h-10 w-10 rounded-full text-muted-foreground hover:text-foreground'
							})}><SquareCheckBig size={20} /></Tooltip.Trigger
						>
						<Tooltip.Content side="right" sideOffset={10}>
							<p>Agenda</p>
						</Tooltip.Content>
					</Tooltip.Root>
				</Tooltip.Provider>
				<Tooltip.Provider disableHoverableContent={true}>
					<Tooltip.Root>
						<Tooltip.Trigger
							class={buttonVariants({
								variant: 'ghost',
								size: 'icon',
								class: 'h-10 w-10 rounded-full text-muted-foreground hover:text-foreground'
							})}><LayoutGrid size={20} /></Tooltip.Trigger
						>
						<Tooltip.Content side="right" sideOffset={10}>
							<p>Projects</p>
						</Tooltip.Content>
					</Tooltip.Root>
				</Tooltip.Provider>
				<Tooltip.Provider disableHoverableContent={true}>
					<Tooltip.Root>
						<Tooltip.Trigger
							class={buttonVariants({
								variant: 'ghost',
								size: 'icon',
								class: 'h-10 w-10 rounded-full text-muted-foreground hover:text-foreground'
							})}><Calendar size={20} /></Tooltip.Trigger
						>
						<Tooltip.Content side="right" sideOffset={10}>
							<p>Calendar</p>
						</Tooltip.Content>
					</Tooltip.Root>
				</Tooltip.Provider>
			</div>

			<div class="sticky top-0 z-10 h-1 w-full bg-secondary">
				<div class="h-full bg-primary" style="width: 45%"></div>
			</div>

			<div class="mx-auto max-w-3xl px-6 py-12 lg:py-20">
				<slot />
			</div>
		</main>
	</div>
</div>
