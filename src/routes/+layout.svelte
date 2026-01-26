<script lang="ts">
	import './layout.css';
	import { Button } from '$lib/components/ui/button';
	import CalendarIcon from '@lucide/svelte/icons/calendar';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import SquareCheckBigIcon from '@lucide/svelte/icons/square-check-big';
	import PanelLeftIcon from '@lucide/svelte/icons/panel-left';
	import UserIcon from '@lucide/svelte/icons/user';
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';
	import TDAgenda from '$lib/components/TDAgenda.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { buttonVariants } from '$lib/components/ui/button';
</script>

<div class="flex h-screen overflow-hidden bg-background text-foreground">
	<div class="relative flex h-full flex-1 flex-col">
		<header class="flex items-center justify-between px-6 py-4">
			<TDAgenda />

			<div class="flex-1"></div>

			<Avatar
				class="h-8 w-8 cursor-pointer ring-offset-background transition-all hover:ring-2 hover:ring-ring"
			>
				<AvatarImage src="https://github.com/shadcn.png" alt="User" />
				<AvatarFallback><UserIcon /></AvatarFallback>
			</Avatar>
		</header>

		<main class="flex-1 overflow-y-auto">
			<div class="absolute top-1/2 left-3 hidden -translate-y-1/2 flex-col gap-3 lg:flex">
				<Tooltip.Provider disableHoverableContent={true}>
					<Tooltip.Root>
						<Tooltip.Trigger
							class={buttonVariants({
								variant: 'secondary',
								size: 'icon',
								class: 'h-10 w-10 rounded-full text-muted-foreground hover:text-foreground'
							})}><SquareCheckBigIcon size={20} /></Tooltip.Trigger
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
							})}><LayoutGridIcon size={20} /></Tooltip.Trigger
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
							})}><CalendarIcon size={20} /></Tooltip.Trigger
						>
						<Tooltip.Content side="right" sideOffset={10}>
							<p>Calendar</p>
						</Tooltip.Content>
					</Tooltip.Root>
				</Tooltip.Provider>
			</div>

			<div class="sticky top-0 z-10 h-0 border-b">
				<div class="h-full bg-primary" style="width: 45%"></div>
			</div>

			<div class="mx-auto max-w-3xl px-6 py-12 lg:py-20">
				<slot />
			</div>
		</main>
	</div>
</div>
