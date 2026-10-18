// A stand-in libvulkan.so.1 for tools/shots/vkshot.sh: forwards everything to the real loader, but
// offers VK_KHR_xlib_surface on top of an ICD that only has VK_KHR_xcb_surface (SwiftShader), so
// Godot's X11 display server can run its Vulkan renderers in the container.
#define _GNU_SOURCE
#include <dlfcn.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

typedef int32_t VkResult;
typedef uint32_t VkFlags;
typedef void *VkInstance;
typedef void *VkPhysicalDevice;
typedef uint64_t VkSurfaceKHR;
typedef void (*PFN_vkVoidFunction)(void);
typedef PFN_vkVoidFunction (*PFN_gipa)(VkInstance, const char *);

typedef struct {
	char extensionName[256];
	uint32_t specVersion;
} VkExtensionProperties;

typedef struct {
	int sType;
	const void *pNext;
	VkFlags flags;
	const void *pApplicationInfo;
	uint32_t enabledLayerCount;
	const char *const *ppEnabledLayerNames;
	uint32_t enabledExtensionCount;
	const char *const *ppEnabledExtensionNames;
} VkInstanceCreateInfo;

typedef struct {
	int sType;
	const void *pNext;
	VkFlags flags;
	void *dpy;
	unsigned long window;
} VkXlibSurfaceCreateInfoKHR;

typedef struct {
	int sType;
	const void *pNext;
	VkFlags flags;
	void *connection;
	uint32_t window;
} VkXcbSurfaceCreateInfoKHR;

#define STYPE_XCB_SURFACE 1000005000

static void *real;
static PFN_gipa real_gipa;
static void *(*get_xcb)(void *);

static void init(void) {
	if (real)
		return;
	real = dlopen("/usr/lib/x86_64-linux-gnu/libvulkan.so.1", RTLD_NOW | RTLD_LOCAL);
	real_gipa = (PFN_gipa)dlsym(real, "vkGetInstanceProcAddr");
	void *x = dlopen("libX11-xcb.so.1", RTLD_NOW);
	get_xcb = (void *(*)(void *))dlsym(x, "XGetXCBConnection");
}

typedef VkResult (*PFN_enum)(const char *, uint32_t *, VkExtensionProperties *);
static VkResult my_enum(const char *layer, uint32_t *count, VkExtensionProperties *props) {
	PFN_enum f = (PFN_enum)real_gipa(NULL, "vkEnumerateInstanceExtensionProperties");
	if (layer)
		return f(layer, count, props);
	uint32_t n = 0;
	f(NULL, &n, NULL);
	if (!props) {
		*count = n + 1;
		return 0;
	}
	VkExtensionProperties *tmp = calloc(n + 1, sizeof(*tmp));
	f(NULL, &n, tmp);
	strcpy(tmp[n].extensionName, "VK_KHR_xlib_surface");
	tmp[n].specVersion = 6;
	uint32_t c = *count < n + 1 ? *count : n + 1;
	memcpy(props, tmp, c * sizeof(*tmp));
	free(tmp);
	*count = c;
	return c < n + 1 ? 5 /* VK_INCOMPLETE */ : 0;
}

typedef VkResult (*PFN_ci)(const VkInstanceCreateInfo *, const void *, VkInstance *);
static VkResult my_create_instance(const VkInstanceCreateInfo *ci, const void *alloc, VkInstance *out) {
	PFN_ci f = (PFN_ci)real_gipa(NULL, "vkCreateInstance");
	VkInstanceCreateInfo c = *ci;
	const char **names = calloc(ci->enabledExtensionCount + 1, sizeof(char *));
	for (uint32_t i = 0; i < ci->enabledExtensionCount; i++) {
		names[i] = ci->ppEnabledExtensionNames[i];
		if (strcmp(names[i], "VK_KHR_xlib_surface") == 0)
			names[i] = "VK_KHR_xcb_surface";
	}
	c.ppEnabledExtensionNames = names;
	return f(&c, alloc, out);
}

typedef VkResult (*PFN_xcb)(VkInstance, const VkXcbSurfaceCreateInfoKHR *, const void *, VkSurfaceKHR *);
static VkResult my_xlib_surface(VkInstance inst, const VkXlibSurfaceCreateInfoKHR *ci, const void *alloc, VkSurfaceKHR *out) {
	PFN_xcb f = (PFN_xcb)real_gipa(inst, "vkCreateXcbSurfaceKHR");
	VkXcbSurfaceCreateInfoKHR x = {STYPE_XCB_SURFACE, NULL, 0, get_xcb(ci->dpy), (uint32_t)ci->window};
	return f(inst, &x, alloc, out);
}

static uint32_t my_xlib_present(VkPhysicalDevice pd, uint32_t q, void *dpy, unsigned long vid) {
	return 1;
}

PFN_vkVoidFunction vkGetInstanceProcAddr(VkInstance inst, const char *name) {
	init();
	if (!strcmp(name, "vkGetInstanceProcAddr"))
		return (PFN_vkVoidFunction)vkGetInstanceProcAddr;
	if (!strcmp(name, "vkEnumerateInstanceExtensionProperties"))
		return (PFN_vkVoidFunction)my_enum;
	if (!strcmp(name, "vkCreateInstance"))
		return (PFN_vkVoidFunction)my_create_instance;
	if (!strcmp(name, "vkCreateXlibSurfaceKHR"))
		return (PFN_vkVoidFunction)my_xlib_surface;
	if (!strcmp(name, "vkGetPhysicalDeviceXlibPresentationSupportKHR"))
		return (PFN_vkVoidFunction)my_xlib_present;
	return real_gipa(inst, name);
}

VkResult vkEnumerateInstanceExtensionProperties(const char *layer, uint32_t *count, VkExtensionProperties *props) {
	init();
	return my_enum(layer, count, props);
}

VkResult vkCreateInstance(const VkInstanceCreateInfo *ci, const void *alloc, VkInstance *out) {
	init();
	return my_create_instance(ci, alloc, out);
}
